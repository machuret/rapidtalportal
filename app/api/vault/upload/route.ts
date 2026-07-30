import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { vaultUploadLimiter, tooManyRequests } from "@/lib/rate-limit";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";
import { safeKeyName } from "@/lib/storage-keys";
import { errorMessage } from "@/lib/error-message";

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// Server-side allowlist. The browser `accept=` attribute is advisory only — a
// crafted request can POST any blob — so the type is re-checked here by both
// extension AND magic bytes for the binary formats. Never trust `file.type`.
const ALLOWED_EXT = new Set(["pdf", "docx", "txt", "md", "csv"]);

export const POST = withAuth(async (req, { user }) => {
  const rl = vaultUploadLimiter.check(`upload:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const title = (form.get("title") as string) || file?.name || "Untitled";
  const clientId = form.get("clientId") as string;
  const userId = user.id;

  if (!file || !clientId) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, clientId);
  if (accessError) return accessError;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds 25MB limit." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF, DOCX, TXT, MD, or CSV." },
      { status: 415 },
    );
  }
  // Magic-byte sniff for the binary formats — don't let a renamed .exe through.
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07); // PK.. (docx = zip)
  if (ext === "pdf" && !isPdf) {
    return NextResponse.json({ error: "This file isn't a valid PDF." }, { status: 415 });
  }
  if (ext === "docx" && !isZip) {
    return NextResponse.json({ error: "This file isn't a valid DOCX." }, { status: 415 });
  }

  const sourceType = ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "text";
  const supabase = createAdminClient();

  // Save to Supabase Storage (key must be sanitised; title keeps the real name)
  const storagePath = `vault/${clientId}/${Date.now()}-${safeKeyName(file.name)}`;
  const { error: storageError } = await supabase.storage
    .from("vault")
    .upload(storagePath, file, { contentType: file.type });

  if (storageError) {
    return serverError(storageError, { userId, clientId });
  }

  // Insert vault item
  const { data: item, error: insertError } = await supabase
    .from("vault_items")
    .insert({
      client_id: clientId,
      source_type: sourceType,
      title,
      storage_path: storagePath,
      status: "processing",
      created_by: userId,
    })
    .select()
    .single();

  if (insertError || !item) {
    await supabase.storage.from("vault").remove([storagePath]);
    return serverError(insertError ?? new Error("Insert failed"), { userId, clientId });
  }

  const itemId = (item as { id: string }).id;

  // Extract text, compute content hash for deduplication, then auto-trigger AI processing
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";

    if (sourceType === "pdf") {
      // pdf-parse v1 ENOENT fix: import from /lib/ directly to bypass the
      // index.js test-file auto-load that fails in Vercel serverless (no local fs)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (sourceType === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString("utf8");
    }

    // Generate content hash for deduplication
    const contentHash = createHash("sha256").update(text).digest("hex");

    // Check for duplicate content within the same client
    const { data: duplicate, error: duplicateError } = await supabase
      .from("vault_items")
      .select("id, title")
      .eq("client_id", clientId)
      .eq("content_hash", contentHash)
      .neq("id", itemId)
      .maybeSingle();
    if (duplicateError) throw duplicateError;

    if (duplicate) {
      // Remove the new item and its storage file — it's a duplicate
      await Promise.all([
        supabase.from("vault_items").delete().eq("id", itemId),
        supabase.storage.from("vault").remove([storagePath]),
      ]);
      return NextResponse.json(
        { error: `Duplicate content. This document matches existing item "${(duplicate as { title: string }).title}".` },
        { status: 409 }
      );
    }

    // Honest ingestion: if extraction produced (near-)no text, flag it instead of
    // marking it "ready" — a scanned/image PDF would otherwise become a silent
    // blind spot the brain can never answer from.
    if (text.trim().length < 50) {
      const { error: emptyTextError } = await supabase
        .from("vault_items")
        .update({
          raw_content: text,
          content_hash: contentHash,
          status: "error",
          error_message:
            sourceType === "pdf"
              ? "No readable text found — this PDF looks scanned or image-based. Paste the text manually, or upload a text-based version."
              : "No readable text could be extracted from this file.",
        })
        .eq("id", itemId);
      if (emptyTextError) throw emptyTextError;
      return NextResponse.json({
        success: true,
        warning: "No readable text found in this file — it was flagged for attention.",
      });
    }

    const { error: hashError } = await supabase
      .from("vault_items")
      .update({ raw_content: text, content_hash: contentHash, status: "ready" })
      .eq("id", itemId);

    // Unique-index violation = another item with this exact content already
    // exists (a race the SELECT above couldn't catch). Treat as a duplicate:
    // roll back this upload so content is never indexed twice.
    if (hashError) {
      if (hashError.code === "23505") {
        await Promise.all([
          supabase.from("vault_items").delete().eq("id", itemId),
          supabase.storage.from("vault").remove([storagePath]),
        ]);
        return NextResponse.json(
          { error: "Duplicate content. This document is already in the Vault." },
          { status: 409 },
        );
      }
      throw new Error(hashError.message);
    }

    // Index for AI search — survives past the response via waitUntil.
    scheduleVaultProcess(itemId, clientId);
  } catch (err) {
    const message = errorMessage(err, "The file could not be read.");
    const { error: statusError } = await supabase
      .from("vault_items")
      .update({ status: "error", error_message: message })
      .eq("id", itemId);
    if (statusError) return serverError(statusError, { userId, clientId });
    return NextResponse.json(
      { error: `The file was uploaded, but its contents could not be processed: ${message}` },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true });
});
