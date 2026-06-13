/**
 * vault-ask — Retrieval-augmented Q&A over the WHOLE company brain ("Ask the Vault")
 *
 * Unified retrieval — answers draw from every knowledge source, not just docs:
 *   - Company DNA      → always included (the authoritative company profile)
 *   - Vault documents  → semantic search over vault_chunks (gte-small, 384-dim)
 *   - Knowledge Base   → full-text search over kb_entries (023_knowledge_fts.sql)
 *   - SOPs             → full-text search over sops
 * Each is resilient: if one source errors (or embeddings fail), the rest still answer.
 *
 * Answer via OpenRouter (openai/gpt-4o-mini), grounded ONLY in retrieved context, cited.
 *
 * Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANSWER_PROMPT = `You are the company's friendly in-house expert. Answer the virtual assistant's question using ONLY the company knowledge in the context below.

How to write:
- Sound natural and conversational, like a helpful colleague — not a report or a brochure.
- Plain text only. NO markdown: no **bold**, no headings, no bullet symbols, no markdown links. If a URL genuinely matters, just write it inline as plain text.
- Keep it tight. Only list things out if you're truly listing several items, and keep each one short and plain (e.g. "A Strait Day — a one-day Thursday Island and Horn Island tour").
- Do NOT put citation markers like [1] or [4] in your answer. The sources are shown separately.

Accuracy:
- Use ONLY the provided context. Never invent facts.
- If the answer isn't in the context, say so plainly and suggest what document would help.
- Prefer specifics (names, prices, durations, steps) when they're in the context.`;

const DEEP_PROMPT = `You are the company's most knowledgeable in-house expert. The user asked to "go deeper", so give a genuinely THOROUGH, well-reasoned answer that teaches them everything the documents actually say — not a summary, and never just a restated list.

Think first, then write:
- Work out every facet the question touches, then answer all of them.
- Synthesise ACROSS the documents into one coherent explanation. Do not go source-by-source, and do not repeat the same fact in different words.
- For each point, pull the SPECIFICS out of the context: who it's for, how it actually works, the exact steps, conditions, eligibility, numbers, prices, timeframes, names, and any useful URLs (inline as plain text). Explain each thing — never merely name it.

How to write:
- Natural and conversational, like a senior colleague taking the time to explain it properly and completely.
- Structure a long answer: a short opening sentence that frames the answer, then each major point as its own short paragraph led by a plain-text label on its own line (e.g. "Refinance and rate review") followed by 2-4 explaining sentences.
- Plain text ONLY — no markdown of any kind: no #, no **, no bullet characters, no markdown links. Do NOT put citation markers like [1] in the text; sources are shown separately.

Depth & honesty:
- Use ONLY the provided context, but use ALL of it that's relevant — the blocks below are real documents (ordered roughly most-relevant first), so there is genuine detail to draw on.
- A deep answer must be noticeably richer, longer, and better organised than a quick one. If you catch yourself about to list items with no explanation, stop and dig the detail behind each one out of the context.
- If part of the question genuinely isn't covered, say so plainly and name the document that would fill the gap. Never invent facts.`;

// Models (OpenRouter slugs). Deep uses a stronger model for real synthesis;
// concise stays fast/cheap. Both are env-overridable so the operator can point
// at a newer model without redeploying — set VAULT_DEEP_MODEL=openai/gpt-4o to
// revert. OpenRouter normalises every model to OpenAI-style SSE, so the
// streaming passthrough below works regardless of which model is set.
const CONCISE_MODEL = Deno.env.get("VAULT_ASK_MODEL") || "openai/gpt-4o-mini";
const DEEP_MODEL = Deno.env.get("VAULT_DEEP_MODEL") || "anthropic/claude-3.5-sonnet";

const SOURCE_LABEL: Record<string, string> = {
  dna: "Company DNA",
  vault: "Vault document",
  kb: "Knowledge Base",
  sop: "SOP",
};

/**
 * Admin prompt overrides (/admin/prompts → ai_prompts table). When a row
 * exists for the slug, it replaces the built-in default above — so prompt
 * edits go live without redeploying this function. Cached briefly per
 * instance; any failure falls back to the defaults.
 */
const promptCache = new Map<string, { content: string | null; at: number }>();
// deno-lint-ignore no-explicit-any
async function promptOverride(admin: any, slug: string, fallback: string): Promise<string> {
  const hit = promptCache.get(slug);
  if (hit && Date.now() - hit.at < 30_000) return hit.content ?? fallback;
  try {
    const { data } = await admin.from("ai_prompts").select("content").eq("slug", slug).maybeSingle();
    const content = (data?.content as string | undefined) ?? null;
    promptCache.set(slug, { content, at: Date.now() });
    return content ?? fallback;
  } catch {
    return fallback;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Multi-query retrieval: one cheap LLM call rewrites the question into a few
 * different search angles (synonyms, adjacent phrasings, concrete nouns), so
 * retrieval also catches documents that describe the answer in different words
 * than the user happened to use ("services" → "loan products", "what we offer").
 * Best-effort with a hard timeout — on any failure we just search the raw question.
 */
async function expandQuery(key: string, question: string): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 120,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: 'Rewrite the user\'s question as 3 SHORT, mutually different search queries for a company knowledge base. Use synonyms, adjacent angles, and concrete nouns; do not repeat the original wording. Return JSON exactly as {"queries":["q1","q2","q3"]}.',
          },
          { role: "user", content: question.slice(0, 500) },
        ],
      }),
    });
    clearTimeout(timer);
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return (Array.isArray(parsed.queries) ? parsed.queries : [])
      .filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Base64(UTF-8) so source titles with non-Latin chars survive the header. */
function encodeSources(s: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

/** A one-shot SSE response (OpenAI delta format) for the no-context case. */
function sseOnce(content: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Vault-Sources": encodeSources([]) },
  });
}

interface Block { kind: "dna" | "vault" | "kb" | "sop"; title: string; text: string; itemId?: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    // deno-lint-ignore no-explicit-any
    let body: any = {};
    try { body = await req.json(); } catch { /* no/invalid body */ }

    // ── Keep-warm ping ─────────────────────────────────────────────────────────
    // Boots the isolate AND loads the gte-small model so real questions are fast.
    // No auth/DB — safe to call from a scheduled job.
    if (body?.ping) {
      try {
        // deno-lint-ignore no-explicit-any
        const s = new (globalThis as any).Supabase.ai.Session("gte-small");
        await s.run("warm", { mean_pool: true, normalize: true });
      } catch (_e) { /* ignore */ }
      return json({ ok: true });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized." }, 401);
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) return json({ error: "OpenRouter not configured." }, 500);

    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) return json({ error: "Unauthorized." }, 401);

    const { data: userRow } = await admin.from("users").select("role, client_id").eq("id", authUser.id).single();
    if (!userRow) return json({ error: "User record not found." }, 403);
    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;

    // ── Input ─────────────────────────────────────────────────────────────────
    const clientId: string = body.clientId;
    const question: string = (body.question ?? "").toString().trim();
    const deep = body.mode === "deep";
    const matchCount: number = deep ? 18 : 8;
    // Deep mode is document-centric: it feeds the model whole sections (capped),
    // more of them, and a bigger output budget — so the stronger model has real
    // material to synthesise instead of rephrasing the same short snippet.
    const ftsDocLimit = deep ? 8 : 5;
    const ftsChunkLimit = deep ? 8 : 3;
    const rawDocChars = deep ? 10000 : 3000;
    // Neighbour chunks pulled around each vector hit — deep reads the whole
    // surrounding section, not just the matched sentence.
    const neighbourSpan = deep ? 3 : 0;

    // Conversation memory: recent turns make follow-ups ("what about pricing?")
    // work. We use the last couple of questions to broaden retrieval, and replay
    // the turns to the model so it understands the thread.
    const history: { question?: string; answer?: string }[] = Array.isArray(body.history) ? body.history.slice(-4) : [];
    const recentQs = history.map((h) => (h?.question ?? "").toString()).filter(Boolean).slice(-2);
    // Embedding query carries recent turns so follow-ups stay on-topic…
    const retrievalQuery = [...recentQs, question].join(" ").trim();
    // …but keyword (websearch) FTS must use ONLY the current question:
    // websearch_to_tsquery ANDs every term, so concatenated history makes the
    // query stricter with each follow-up until it matches nothing.
    const ftsQuery = question;

    if (!clientId || !question) return json({ error: "Missing clientId or question." }, 400);
    if (question.length < 3) return json({ error: "Question too short." }, 422);
    if (role !== "super_admin" && userClientId !== clientId) return json({ error: "Forbidden." }, 403);

    // Best-effort question log (powers gap detection / analytics). Never throws.
    // deno-lint-ignore no-explicit-any
    const logQuery = async (sourcesCount: number) => {
      try {
        await admin.from("vault_queries").insert({
          client_id: clientId,
          user_id: authUser.id,
          question,
          mode: deep ? "deep" : "concise",
          sources_count: sourcesCount,
          answered: sourcesCount > 0,
        });
      } catch (_e) { /* table may not exist yet; ignore */ }
    };

    // ── Embed the question (gte-small) — non-fatal: if it fails we still answer
    //    from DNA/KB/SOPs. ─────────────────────────────────────────────────────
    // ── Query expansion (multi-query retrieval) ───────────────────────────────
    // One cheap LLM call turns the question into extra search angles; we then
    // embed AND keyword-search every angle and merge. This is what catches the
    // documents that answer the question in different words.
    const variants = await expandQuery(openrouterKey, question);
    const embedQueries = [retrievalQuery, ...variants];      // history-aware first
    const ftsQueries = [ftsQuery, ...variants].slice(0, 4);  // current question first

    let embeddings: number[][] = [];
    try {
      // deno-lint-ignore no-explicit-any
      const session = new (globalThis as any).Supabase.ai.Session("gte-small");
      embeddings = (await Promise.all(
        embedQueries.map((q) => session.run(q, { mean_pool: true, normalize: true })),
      )) as number[][];
    } catch (e) {
      console.warn("vault-ask: question embedding failed, continuing without vector search:", e);
    }

    // ── Retrieve from all sources in parallel ───────────────────────────────────
    // Hybrid: vector search over chunks PLUS keyword (FTS) search over documents,
    // so exact terms (product names, codes) are caught even when vectors miss.
    const perEmbed = Math.max(deep ? 8 : 4, Math.ceil(matchCount / Math.max(1, embeddings.length)));
    const [dnaRes, kbRes, sopRes, vaultResults, ftsResults] = await Promise.all([
      admin.from("company_dna").select("*").eq("client_id", clientId).maybeSingle(),
      admin.from("kb_entries").select("question, answer")
        .eq("client_id", clientId)
        .textSearch("fts", ftsQuery, { type: "websearch", config: "english" })
        .limit(3),
      admin.from("sops").select("title, body")
        .eq("client_id", clientId)
        .textSearch("fts", ftsQuery, { type: "websearch", config: "english" })
        .limit(2),
      Promise.all(embeddings.map((e) =>
        admin.rpc("match_vault_chunks", { p_client_id: clientId, p_query_embedding: e, p_match_count: perEmbed }),
      )),
      Promise.all(ftsQueries.map((q) =>
        admin.from("vault_items").select("id, title, ai_summary, raw_content")
          .eq("client_id", clientId)
          .eq("status", "ready")
          .textSearch("fts", q, { type: "websearch", config: "english" })
          .limit(deep ? 10 : 8),
      )),
    ]);

    const blocks: Block[] = [];

    // 1. Company DNA — always, the authoritative profile.
    const dna = dnaRes.data as Record<string, unknown> | null;
    if (dna) {
      const lines: string[] = [];
      const add = (label: string, v: unknown) => { if (v && String(v).trim()) lines.push(`${label}: ${String(v).trim()}`); };
      add("Company name", dna.company_name); add("Founders", dna.founders); add("Location", dna.location);
      add("Phone", dna.phone); add("Email", dna.email); add("Website", dna.website);
      add("Services", dna.services); add("Values", dna.values);
      add("Target audience", dna.target_demographic); add("Client type", dna.client_type);
      if (dna.extra && typeof dna.extra === "object") {
        for (const [k, v] of Object.entries(dna.extra as Record<string, unknown>)) add(k, v);
      }
      if (lines.length) blocks.push({ kind: "dna", title: "Company DNA", text: lines.join("\n") });
    }

    // 2. Vault docs — semantic matches across ALL query variants, merged and
    //    deduped by chunk (best similarity wins), grouped one block per document.
    type Match = { id: string; item_id: string; content: string; chunk_index: number; similarity: number };
    const byChunk = new Map<string, Match>();
    for (const r of vaultResults) {
      if (r.error) continue;
      for (const m of (r.data ?? []) as Match[]) {
        const prev = byChunk.get(m.id);
        if (!prev || m.similarity > prev.similarity) byChunk.set(m.id, m);
      }
    }
    const matches = [...byChunk.values()].sort((a, b) => b.similarity - a.similarity).slice(0, matchCount);

    if (matches.length) {
      const itemIds = [...new Set(matches.map((c) => c.item_id))];
      // Deep mode also pulls raw_content as a fallback for un-chunked docs.
      const { data: itemRows } = await admin
        .from("vault_items").select(deep ? "id, title, raw_content" : "id, title").in("id", itemIds);
      const rowById = new Map<string, { title: string; raw_content?: string | null }>();
      for (const r of (itemRows ?? []) as { id: string; title: string; raw_content?: string | null }[]) rowById.set(r.id, r);
      const orderedIds: string[] = [];
      for (const c of matches) if (!orderedIds.includes(c.item_id)) orderedIds.push(c.item_id);

      // Deep mode reads the RELEVANT SECTIONS: each matched chunk plus its
      // neighbours (±2), stitched in document order. The first-N-chars approach
      // fed the model front-matter/TOC boilerplate from long manuals; this
      // targets where the answer actually lives.
      const chunksByItem = new Map<string, { chunk_index: number; content: string }[]>();
      if (deep && orderedIds.length) {
        const { data: allCks } = await admin
          .from("vault_chunks")
          .select("item_id, chunk_index, content")
          .in("item_id", orderedIds)
          .order("chunk_index", { ascending: true });
        for (const c of (allCks ?? []) as { item_id: string; chunk_index: number; content: string }[]) {
          const arr = chunksByItem.get(c.item_id) ?? [];
          arr.push({ chunk_index: c.chunk_index, content: c.content });
          chunksByItem.set(c.item_id, arr);
        }
      }

      for (const id of orderedIds) {
        const row = rowById.get(id);
        let text = "";
        if (deep) {
          const all = chunksByItem.get(id) ?? [];
          if (all.length) {
            const wanted = new Set<number>();
            for (const m of matches.filter((c) => c.item_id === id)) {
              for (let i = m.chunk_index - neighbourSpan; i <= m.chunk_index + neighbourSpan; i++) wanted.add(i);
            }
            // Stitch kept chunks in document order, inserting an ellipsis ONLY
            // where chunks are non-contiguous — so the model isn't falsely told
            // there's a gap between sections that actually run on.
            const kept = all.filter((c) => wanted.has(c.chunk_index));
            let stitched = "";
            let prevIdx: number | null = null;
            for (const c of kept) {
              if (prevIdx !== null) stitched += c.chunk_index === prevIdx + 1 ? "\n" : "\n…\n";
              stitched += c.content.trim();
              prevIdx = c.chunk_index;
            }
            text = stitched.slice(0, rawDocChars);
          }
          if (!text) text = (row?.raw_content ?? "").slice(0, rawDocChars).trim();
        }
        if (!text) text = matches.filter((c) => c.item_id === id).map((c) => c.content.trim()).join("\n…\n");
        blocks.push({ kind: "vault", title: row?.title ?? "Untitled", text, itemId: id });
      }
    }

    // 2b. Hybrid: docs found by keyword search (any variant) that vectors
    //     missed — merged + deduped across variants, first-seen order.
    {
      const vectorItemIds = new Set(matches.map((c) => c.item_id));
      const ftsSeen = new Set<string>();
      const ftsMerged: { id: string; title: string; ai_summary: string | null; raw_content: string | null }[] = [];
      for (const r of ftsResults) {
        if (r.error) continue;
        for (const it of (r.data ?? []) as { id: string; title: string; ai_summary: string | null; raw_content: string | null }[]) {
          if (!ftsSeen.has(it.id)) { ftsSeen.add(it.id); ftsMerged.push(it); }
        }
      }
      const ftsItems = ftsMerged
        .filter((it) => !vectorItemIds.has(it.id))
        .slice(0, ftsDocLimit);
      for (const it of ftsItems) {
        try {
          // Deep: the whole document (capped). Concise: leading chunks, falling
          // back to raw content if the doc was never embedded — so a keyword-
          // matched document always reaches the model instead of contributing
          // nothing (what made Ask say "not in the context" for docs that exist).
          let text = "";
          if (deep && it.raw_content) {
            text = it.raw_content.slice(0, rawDocChars).trim();
          } else {
            const { data: cks } = await admin
              .from("vault_chunks")
              .select("content")
              .eq("item_id", it.id)
              .order("chunk_index", { ascending: true })
              .limit(ftsChunkLimit);
            text = ((cks ?? []) as { content: string }[]).map((c) => c.content.trim()).join("\n…\n");
            if (!text) text = (it.raw_content ?? it.ai_summary ?? "").slice(0, rawDocChars).trim();
          }
          if (text) blocks.push({ kind: "vault", title: it.title, text, itemId: it.id });
        } catch (_e) { /* best-effort */ }
      }
    }

    // 3. Knowledge Base — keyword matches.
    if (!kbRes.error) {
      for (const e of (kbRes.data ?? []) as { question: string; answer: string }[]) {
        blocks.push({ kind: "kb", title: e.question, text: `Q: ${e.question}\nA: ${e.answer}` });
      }
    }

    // 4. SOPs — keyword matches.
    if (!sopRes.error) {
      for (const s of (sopRes.data ?? []) as { title: string; body: string }[]) {
        blocks.push({ kind: "sop", title: s.title, text: (s.body ?? "").slice(0, 1500) });
      }
    }

    const stream = body.stream === true;

    if (!blocks.length) {
      await logQuery(0);
      const msg = "I don't have anything in the Vault that answers this yet. Add a relevant document (or fill in Company DNA), then it'll show up here.";
      if (stream) return sseOnce(msg);
      return json({ answer: msg, sources: [], chunksUsed: 0 });
    }

    // ── Build grounded context + sources ────────────────────────────────────────
    let context = "";
    blocks.forEach((b, i) => {
      context += `[${i + 1}] (${SOURCE_LABEL[b.kind]}) ${b.title}\n${b.text}\n\n`;
    });
    // Backstop so a pathological set of long documents can't blow the model's
    // context window or the time budget. Per-doc caps above keep this generous.
    const MAX_CONTEXT = deep ? 90000 : 24000;
    if (context.length > MAX_CONTEXT) context = context.slice(0, MAX_CONTEXT);
    const sources = blocks.map((b, i) => ({
      n: i + 1,
      kind: b.kind,
      kindLabel: SOURCE_LABEL[b.kind],
      title: b.title,
      itemId: b.itemId ?? null,
    }));

    const systemPrompt = deep
      ? await promptOverride(admin, "vault.ask.deep", DEEP_PROMPT)
      : await promptOverride(admin, "vault.ask.answer", ANSWER_PROMPT);

    const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://rapidtal.online",
        "X-Title": "RapidTal Portal",
      },
      body: JSON.stringify({
        // Deep mode uses a stronger model for harder synthesis; concise stays
        // on the fast/cheap model (it answers most questions well once the
        // retrieval above hands it the right context).
        model: deep ? DEEP_MODEL : CONCISE_MODEL,
        max_tokens: deep ? 3000 : 550,
        temperature: 0.4,
        stream,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.flatMap((h) => {
            const q = (h?.question ?? "").toString().trim();
            const a = (h?.answer ?? "").toString().trim().slice(0, 600);
            return q && a ? [{ role: "user", content: q }, { role: "assistant", content: a }] : [];
          }),
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` },
        ],
      }),
    });

    // ── Streaming: pipe OpenRouter's SSE straight through, sources in a header ────
    if (stream) {
      await logQuery(blocks.length);
      if (!chatRes.ok || !chatRes.body) {
        return json({ error: "stream failed" }, 502); // client falls back to non-stream
      }
      return new Response(chatRes.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Vault-Sources": encodeSources(sources),
        },
      });
    }

    // ── Non-streaming ───────────────────────────────────────────────────────────
    const chatJson = await chatRes.json();
    if (!chatRes.ok) {
      return json({ error: `Answer generation failed: ${chatJson?.error?.message ?? "unknown"}` }, 500);
    }

    const answer: string = chatJson.choices?.[0]?.message?.content?.trim() ?? "No answer generated.";
    const tokensUsed: number = chatJson.usage?.total_tokens ?? 0;

    await logQuery(blocks.length);
    return json({ answer, sources, chunksUsed: blocks.length, tokensUsed });
  } catch (error) {
    console.error("❌ vault-ask error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
