/**
 * vault-process — AI metadata extraction for existing vault items
 *
 * Purpose: Extract/refresh ai_summary, category, and tags from a vault item's
 *          raw_content using OpenAI. Can be called after initial insert or
 *          triggered manually by a re-process request.
 *
 * Called by:
 *   - vault-crawl (internally after URL crawl insert)
 *   - /api/vault/[id]/reprocess (manual re-process from UI)
 *   - /api/vault/[id] PATCH (after content edit)
 *
 * DB Reads:  vault_items (raw_content, client_id, status)
 * DB Writes: vault_items (category, tags, ai_summary, status, error_message, updated_at)
 *
 * Auth:    Bearer JWT → getUser() → DB user row → client membership check
 * Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * AI:      summary via OpenRouter (openai/gpt-4o-mini); embeddings via Supabase
 *          built-in gte-small (384-dim, no key). DB Writes also: vault_chunks.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** OpenAI prompt — produces structured JSON with exactly the fields we store */
const PROCESS_PROMPT = `You are an AI assistant that analyses business documents for a knowledge management system.

Given the document content, return a JSON object with EXACTLY these fields:

{
  "ai_summary": "2-3 sentence summary of what this document is about and why it matters for the business",
  "category": "ONE of: process, policy, service, contact, reference, general",
  "tags": ["array", "of", "3-8", "relevant", "keyword", "tags"]
}

Category guide:
- process: step-by-step workflows, how-to guides, procedures, onboarding
- policy: rules, guidelines, compliance, terms, restrictions
- service: products offered, pricing, features, packages, service descriptions
- contact: people, phone numbers, emails, addresses, suppliers, clients
- reference: background info, industry knowledge, glossaries, FAQs
- general: anything that doesn't fit above

Requirements:
- ai_summary must be useful for a VA reading it quickly — practical, specific
- tags must be lowercase single words or short phrases, no punctuation
- category must be exactly one of the six options listed`;

/** Character-level fallback splitter (paragraph/sentence-boundary aware). */
function charChunks(text: string, maxLen = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxLen, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const para = slice.lastIndexOf("\n\n");
      const sent = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      const bp = para > maxLen * 0.5 ? para : sent > maxLen * 0.5 ? sent : -1;
      if (bp > 0) end = start + bp + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

/** Does this line look like a section heading? (markdown #, SECTION X, ALL-CAPS short line) */
function isHeading(line: string): boolean {
  const l = line.trim();
  if (!l || l.length > 90) return false;
  if (/^#{1,6}\s+\S/.test(l)) return true;
  if (/^(section|part|chapter)\s+\d+/i.test(l)) return true;
  if (l.length >= 8 && l === l.toUpperCase() && /[A-Z]{4,}/.test(l) && !/[.!?]$/.test(l)) return true;
  return false;
}

/**
 * Structure-aware, context-carrying chunking.
 * Splits on document headings first (so chunks don't sever a section), falls
 * back to character chunks within oversized sections, and prefixes EVERY chunk
 * with the document title + section heading — so each embedded vector knows
 * what it is about ("the price is $450" → "[KB v4 › Tours] the price is $450").
 */
function chunkText(text: string, title: string, maxLen = 1200, maxChunks = 200): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  // Split into (heading, body) sections.
  const sections: { heading: string; body: string }[] = [];
  let heading = "";
  let buf: string[] = [];
  for (const line of clean.split("\n")) {
    if (isHeading(line)) {
      if (buf.join("\n").trim()) sections.push({ heading, body: buf.join("\n").trim() });
      heading = line.replace(/^#{1,6}\s*/, "").trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (buf.join("\n").trim()) sections.push({ heading, body: buf.join("\n").trim() });
  if (!sections.length) sections.push({ heading: "", body: clean });

  const out: string[] = [];
  const shortTitle = title.slice(0, 80);
  for (const s of sections) {
    if (out.length >= maxChunks) break;
    const prefix = s.heading ? `[${shortTitle} › ${s.heading.slice(0, 60)}]\n` : `[${shortTitle}]\n`;
    for (const piece of charChunks(s.body, maxLen)) {
      if (out.length >= maxChunks) break;
      out.push(prefix + piece);
    }
  }
  return out;
}

/**
 * Chunk + embed the full document and (re)write its vault_chunks rows. Existing
 * chunks are cleared first so reprocess/edits never leave stale vectors.
 *
 * Returns a precise outcome — { count, error } — which the caller persists to
 * vault_items.indexed_at / index_error. The previous version swallowed every
 * failure into console.warn, which is how production ran for weeks with ~7
 * embeddings and nobody knew. The summary/category remain the primary result;
 * this still never THROWS, it just reports honestly.
 */
// deno-lint-ignore no-explicit-any
async function embedAndStoreChunks(admin: any, itemId: string, clientId: string, title: string, rawContent: string): Promise<{ count: number; error: string | null }> {
  // Clear stale chunks regardless of outcome below.
  await admin.from("vault_chunks").delete().eq("item_id", itemId);

  const chunks = chunkText(rawContent, title);
  if (!chunks.length) return { count: 0, error: "no chunks produced from content" };

  // Supabase's built-in gte-small model (384-dim) — runs in the Edge Runtime
  // with no API key. Accessed via globalThis so it compiles whether or not the
  // Supabase global is typed. Embeds one chunk at a time.
  // deno-lint-ignore no-explicit-any
  let session: any;
  try {
    // deno-lint-ignore no-explicit-any
    session = new (globalThis as any).Supabase.ai.Session("gte-small");
  } catch (e) {
    return { count: 0, error: `gte-small session unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }

  const rows: Record<string, unknown>[] = [];
  let firstEmbedError: string | null = null;
  for (let i = 0; i < chunks.length; i++) {
    try {
      const emb = (await session.run(chunks[i], { mean_pool: true, normalize: true })) as number[];
      rows.push({
        item_id: itemId,
        client_id: clientId,
        chunk_index: i,
        content: chunks[i],
        // pgvector expects the text form "[1,2,3]"; stringify the array.
        embedding: JSON.stringify(emb),
      });
    } catch (e) {
      if (!firstEmbedError) firstEmbedError = `chunk ${i}: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`⚠️ vault-process: embedding chunk ${i} failed for ${itemId}:`, e);
    }
  }
  if (!rows.length) return { count: 0, error: firstEmbedError ?? "all chunks failed to embed" };

  const { error } = await admin.from("vault_chunks").insert(rows);
  if (error) return { count: 0, error: `chunk insert failed: ${error.message}` };

  // Partial success is still success, but note what was dropped.
  const dropped = chunks.length - rows.length;
  return { count: rows.length, error: dropped > 0 ? `${dropped} of ${chunks.length} chunks failed (first: ${firstEmbedError})` : null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use service role for all DB ops — bypasses RLS safely server-side
    const admin = createClient(supabaseUrl, serviceKey);

    // Two kinds of caller:
    //   (a) A logged-in user (UI "reprocess") presenting their own JWT.
    //   (b) A trusted server-to-server call (the post-ingest trigger in
    //       lib/vault-process-trigger.ts) presenting the service-role key.
    // For (b) we skip the user/role checks — only our own backend holds the
    // service-role key — and rely on the clientId-scoped item fetch below.
    const isInternal = jwt === serviceKey;

    let actorId: string | null = null;
    let role = "super_admin";
    let userClientId: string | null = null;

    if (!isInternal) {
      // Validate JWT using anon client — getUser() is the secure server-side check
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch user row to verify role and client membership
      const { data: userRow } = await admin
        .from("users")
        .select("role, client_id")
        .eq("id", authUser.id)
        .single();

      if (!userRow) {
        return new Response(JSON.stringify({ error: "User record not found." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      actorId = authUser.id;
      role = (userRow as { role: string }).role;
      userClientId = (userRow as { client_id: string | null }).client_id;
    }

    // ── Validate input ────────────────────────────────────────────────────────
    const body = await req.json();
    const { itemId, clientId } = body;

    if (!itemId || !clientId) {
      return new Response(JSON.stringify({ error: "Missing itemId or clientId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client membership check — super_admin (and trusted internal calls) can
    // process any client's items; everyone else must match their own client.
    if (!isInternal && role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch vault item ──────────────────────────────────────────────────────
    const { data: item, error: fetchErr } = await admin
      .from("vault_items")
      .select("id, client_id, title, raw_content, status, meta_curated, category, tags")
      .eq("id", itemId)
      .eq("client_id", clientId) // Double-check ownership — never trust clientId alone
      .maybeSingle();

    if (fetchErr || !item) {
      return new Response(JSON.stringify({ error: "Vault item not found or access denied." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemRow = item as { raw_content: string | null; title: string; meta_curated?: boolean; category: string | null; tags: string[] | null };
    const rawContent = itemRow.raw_content ?? "";
    const itemTitle = itemRow.title ?? "Untitled";
    const metaCurated = itemRow.meta_curated === true;

    // Guard: content must be substantive enough for AI to analyse
    if (rawContent.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Content too short to process (minimum 50 characters)." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Env check ─────────────────────────────────────────────────────────────
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "OpenRouter not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing before calling OpenAI — UI can show live status via Realtime
    await admin
      .from("vault_items")
      .update({ status: "processing", updated_at: new Date().toISOString(), updated_by: actorId })
      .eq("id", itemId);

    // ── OpenAI extraction ─────────────────────────────────────────────────────
    console.log(`🤖 vault-process: analysing item ${itemId}`);
    const openaiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://rapidtalportal.vercel.app",
        "X-Title": "RapidTal Portal",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 500, // Summary + category + tags only — keep cost low
        temperature: 0.1, // Low temp = consistent categorisation
        messages: [
          { role: "system", content: PROCESS_PROMPT },
          { role: "user", content: rawContent.slice(0, 30000) }, // Cap input tokens
        ],
      }),
    });

    const openaiJson = await openaiRes.json();

    if (!openaiRes.ok) {
      // Write error back to item so client can see it in the UI
      await admin
        .from("vault_items")
        .update({
          status: "error",
          error_message: `OpenAI error: ${openaiJson?.error?.message ?? "Unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      return new Response(JSON.stringify({ error: "OpenAI call failed." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokensUsed: number = openaiJson.usage?.total_tokens ?? 0;
    const raw: string = openaiJson.choices?.[0]?.message?.content ?? "{}";

    let extracted: { ai_summary?: string; category?: string; tags?: string[] };
    try {
      extracted = JSON.parse(raw);
    } catch {
      await admin
        .from("vault_items")
        .update({ status: "error", error_message: "Failed to parse AI response.", updated_at: new Date().toISOString() })
        .eq("id", itemId);
      return new Response(JSON.stringify({ error: "Failed to parse AI response." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate category — fall back to 'general' if AI returned something invalid
    const validCategories = ["process", "policy", "service", "contact", "reference", "general"];
    const aiCategory = validCategories.includes(extracted.category ?? "") ? extracted.category : "general";

    // Respect human curation: if a person set category/tags, AI must not
    // overwrite them — only the summary (and embeddings) refresh.
    const category = metaCurated ? (itemRow.category ?? aiCategory) : aiCategory;
    const tags = metaCurated
      ? (itemRow.tags ?? [])
      : (Array.isArray(extracted.tags) ? extracted.tags.slice(0, 10) : []);

    // ── Persist results ───────────────────────────────────────────────────────
    const { data: updated, error: updateErr } = await admin
      .from("vault_items")
      .update({
        ai_summary: extracted.ai_summary ?? null,
        category,
        tags,
        status: "ready",
        error_message: null, // Clear any previous error
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      })
      .eq("id", itemId)
      .select()
      .single();

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to save AI results." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Embed for semantic search ─────────────────────────────────────────────
    // Best-effort: chunks power "Ask the Vault" (RAG). A failure here must not
    // fail the request — the summary/category are already saved above. But the
    // OUTCOME is persisted to vault_items (indexed_at / index_error) so a
    // failing embedding pipeline is visible in /admin/health instead of silent.
    let chunksStored = 0;
    let indexError: string | null = null;
    try {
      const outcome = await embedAndStoreChunks(admin, itemId, clientId, itemTitle, rawContent);
      chunksStored = outcome.count;
      indexError = outcome.error;
      console.log(`🧠 vault-process: stored ${chunksStored} embedding chunks for ${itemId}${indexError ? ` (warn: ${indexError})` : ""}`);
    } catch (embErr) {
      indexError = embErr instanceof Error ? embErr.message : String(embErr);
      console.warn(`⚠️ vault-process: embedding step errored for ${itemId}:`, embErr);
    }
    try {
      await admin
        .from("vault_items")
        .update(chunksStored > 0
          ? { indexed_at: new Date().toISOString(), index_error: indexError }
          : { index_error: indexError ?? "indexing produced no chunks" })
        .eq("id", itemId);
    } catch (_e) { /* columns ship in 059; tolerate older schemas */ }

    console.log(`✅ vault-process complete: ${itemId} → category=${category}, tokens=${tokensUsed}, chunks=${chunksStored}`);

    return new Response(JSON.stringify({
      success: true,
      data: updated,
      tokensUsed,
      chunksStored,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ vault-process error:", error);

    // Best-effort: if we know the itemId, write the error back to the DB so the
    // item doesn't stay permanently stuck at 'processing'. We don't have itemId
    // in scope here if the body parse failed, so we guard with a try/catch.
    try {
      const bodyText = await (req.clone() as Request).text();
      const parsed = JSON.parse(bodyText) as { itemId?: string };
      if (parsed?.itemId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const { createClient: createAdminClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const admin = createAdminClient(supabaseUrl, serviceKey);
        await admin
          .from("vault_items")
          .update({ status: "error", error_message: error instanceof Error ? error.message : "Unexpected error", updated_at: new Date().toISOString() })
          .eq("id", parsed.itemId);
      }
    } catch { /* body already consumed or DB unavailable — cannot recover status */ }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
