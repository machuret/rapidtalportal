import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";
import { vaultUploadLimiter, tooManyRequests } from "@/lib/rate-limit";
import { z } from "zod";
import { errorMessage } from "@/lib/error-message";
import { isBlockedUrl } from "@/lib/security/ssrf";

const schema = z.object({
  title: z.string().max(200).optional(),
  url: z.string().url(),
  clientId: z.string().uuid(),
});

/** Derive a readable title from the URL when none is given. */
function deriveTitle(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "";
    const pretty = decodeURIComponent(path).replace(/[-_]+/g, " ").trim();
    return (pretty ? `${u.hostname} — ${pretty}` : u.hostname).slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

// SSRF guard is shared + hardened in lib/security/ssrf.ts (isBlockedUrl).

export const POST = withAuth(async (req, { user }) => {
  // URL ingestion fans out into a paid Firecrawl scrape + embedding pipeline.
  const rl = await vaultUploadLimiter.check(`url:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { url, clientId } = parsed.data;
  const title = parsed.data.title?.trim() || deriveTitle(url);
  const userId = user.id;

  if (isBlockedUrl(url)) {
    return NextResponse.json({ error: "Only public HTTPS URLs are allowed." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, clientId);
  if (accessError) return accessError;

  const supabase = createAdminClient();

  const { data: item, error: insertError } = await supabase
    .from("vault_items")
    .insert({
      client_id: clientId,
      source_type: "url",
      title,
      source_url: url,
      status: "processing",
      created_by: userId,
    })
    .select()
    .single();

  if (insertError || !item) {
    return serverError(insertError ?? new Error("vault_items insert returned no row"));
  }

  const itemId = (item as { id: string }).id;

  // Crawl via Firecrawl if API key is set
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    try {
      const crawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        // onlyMainContent strips nav/footer noise; waitFor lets JS-heavy pages
        // render; timeout gives slow pages room before Firecrawl gives up.
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 2500,
          timeout: 60000,
        }),
      });
      const crawlData = await crawlRes.json();
      const content = crawlData?.data?.markdown ?? crawlData?.markdown ?? "";
      if (!crawlRes.ok || !content) {
        const reason = errorMessage(
          crawlData,
          "the page took too long or returned no content",
        );
        const { error: fetchStatusError } = await supabase
          .from("vault_items")
          .update({ status: "error", error_message: `Couldn't fetch this page — ${reason}.` })
          .eq("id", itemId);
        if (fetchStatusError) {
          return NextResponse.json({ error: errorMessage(fetchStatusError) }, { status: 500 });
        }
        return NextResponse.json(
          { error: `Couldn't fetch this page — ${reason}. Try "Add page" on a lighter URL, or paste the text directly.` },
          { status: 422 },
        );
      }

      // Generate content hash for deduplication
      const contentHash = createHash("sha256").update(content).digest("hex");

      // Check for duplicate URL content within the same client
      const { data: duplicate, error: duplicateError } = await supabase
        .from("vault_items")
        .select("id, title")
        .eq("client_id", clientId)
        .eq("content_hash", contentHash)
        .neq("id", itemId)
        .maybeSingle();
      if (duplicateError) throw duplicateError;

      if (duplicate) {
        await supabase.from("vault_items").delete().eq("id", itemId);
        return NextResponse.json(
          { error: `Duplicate content. This URL matches existing item "${(duplicate as { title: string }).title}".` },
          { status: 409 }
        );
      }

      const { error: hashError } = await supabase
        .from("vault_items")
        .update({ raw_content: content, content_hash: contentHash, status: "ready" })
        .eq("id", itemId);

      // Unique-index violation = this page's content is already indexed (a race
      // the SELECT above missed). Drop the placeholder row and report it.
      if (hashError) {
        if (hashError.code === "23505") {
          await supabase.from("vault_items").delete().eq("id", itemId);
          return NextResponse.json(
            { error: "Duplicate content. This page is already in the Vault." },
            { status: 409 },
          );
        }
        throw new Error(hashError.message);
      }

      // Index for AI search — survives past the response via waitUntil.
      scheduleVaultProcess(itemId, clientId);
    } catch (err) {
      const message = errorMessage(err, "The page could not be processed.");
      const { error: statusError } = await supabase
        .from("vault_items")
        .update({ status: "error", error_message: message })
        .eq("id", itemId);
      if (statusError) return NextResponse.json({ error: errorMessage(statusError) }, { status: 500 });
      return NextResponse.json(
        { error: `The URL was saved, but the page could not be processed: ${message}` },
        { status: 422 },
      );
    }
  } else {
    const { error: statusError } = await supabase
      .from("vault_items")
      .update({ status: "error", error_message: "FIRECRAWL_API_KEY not configured." })
      .eq("id", itemId);
    if (statusError) return NextResponse.json({ error: errorMessage(statusError) }, { status: 500 });
    return NextResponse.json(
      { error: "The URL was saved, but website crawling is not configured." },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
});
