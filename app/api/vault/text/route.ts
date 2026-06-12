import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, assertClientAccess } from "@/lib/api-auth";
import { triggerVaultProcess } from "@/lib/vault-process-trigger";
import { z } from "zod";

const schema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(100000),
  clientId: z.string().uuid(),
});

/** Derive a sensible title from the first non-empty line of pasted text. */
function deriveTitle(content: string): string {
  const firstLine = content
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const t = (firstLine ?? "").slice(0, 80).trim();
  return t.length >= 3 ? t : `Note — ${new Date().toLocaleDateString()}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { content, clientId } = parsed.data;
  const title = parsed.data.title?.trim() || deriveTitle(content);
  const userId = user.id;

  const accessError = assertClientAccess(user, clientId);
  if (accessError) return accessError;

  const supabase = createAdminClient();

  // Deduplicate on exact content within the client (same as upload/url paths)
  const contentHash = createHash("sha256").update(content).digest("hex");
  const { data: duplicate } = await supabase
    .from("vault_items")
    .select("id, title")
    .eq("client_id", clientId)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (duplicate) {
    return NextResponse.json(
      { error: `Duplicate content. This text matches existing item "${(duplicate as { title: string }).title}".` },
      { status: 409 }
    );
  }

  // Insert as "processing" so AI metadata (summary/category/tags) is filled in,
  // matching the upload/url ingestion paths. vault-process flips it to "ready".
  const { data: item, error } = await supabase
    .from("vault_items")
    .insert({
      client_id: clientId,
      source_type: "text",
      title,
      raw_content: content,
      content_hash: contentHash,
      status: "processing",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !item) {
    // Unique-index violation = identical content already indexed for this
    // client (race the SELECT above missed). Surface as a clean duplicate.
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Duplicate content. This text is already in the Vault." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  // Fire-and-forget AI processing — extracts ai_summary, category, tags
  triggerVaultProcess((item as { id: string }).id, clientId);

  return NextResponse.json({ success: true });
}
