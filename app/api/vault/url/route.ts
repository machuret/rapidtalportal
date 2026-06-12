import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, assertClientAccess } from "@/lib/api-auth";
import { triggerVaultProcess } from "@/lib/vault-process-trigger";
import { z } from "zod";

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

const PRIVATE_IP_RE = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i;

function isBlockedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return true;
    if (PRIVATE_IP_RE.test(parsed.hostname)) return true;
    return false;
  } catch {
    return true;
  }
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
    return NextResponse.json({ error: insertError?.message ?? "Insert failed" }, { status: 500 });
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
        const reason = crawlData?.error ?? "the page took too long or returned no content";
        await supabase
          .from("vault_items")
          .update({ status: "error", error_message: `Couldn't fetch this page — ${reason}.` })
          .eq("id", itemId);
        return NextResponse.json(
          { error: `Couldn't fetch this page — ${reason}. Try "Add page" on a lighter URL, or paste the text directly.` },
          { status: 422 },
        );
      }

      // Generate content hash for deduplication
      const contentHash = createHash("sha256").update(content).digest("hex");

      // Check for duplicate URL content within the same client
      const { data: duplicate } = await supabase
        .from("vault_items")
        .select("id, title")
        .eq("client_id", clientId)
        .eq("content_hash", contentHash)
        .neq("id", itemId)
        .maybeSingle();

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

      // Fire-and-forget AI processing — extracts ai_summary, category, tags
      triggerVaultProcess(itemId, clientId);
    } catch (err) {
      await supabase
        .from("vault_items")
        .update({ status: "error", error_message: String(err) })
        .eq("id", itemId);
    }
  } else {
    await supabase
      .from("vault_items")
      .update({ status: "error", error_message: "FIRECRAWL_API_KEY not configured." })
      .eq("id", itemId);
  }

  return NextResponse.json({ success: true });
}
