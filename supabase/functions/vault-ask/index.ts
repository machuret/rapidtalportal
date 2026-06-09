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

const DEEP_PROMPT = `You are the company's friendly in-house expert. Answer the virtual assistant's question THOROUGHLY using ONLY the company knowledge in the context below.

How to write:
- Natural and conversational, like a knowledgeable colleague taking the time to explain it properly.
- Give the full picture: relevant details, options, steps, prices/durations, and any useful URLs written inline as plain text.
- Plain text only. NO markdown: no **bold**, no headings, no markdown links. Short plain lists are fine when you're listing several things.
- Do NOT put citation markers like [1] in your answer. Sources are shown separately.

Accuracy:
- Use ONLY the provided context. Never invent facts.
- If something isn't covered, say so plainly and suggest what document would fill the gap.`;

const SOURCE_LABEL: Record<string, string> = {
  dna: "Company DNA",
  vault: "Vault document",
  kb: "Knowledge Base",
  sop: "SOP",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Block { kind: "dna" | "vault" | "kb" | "sop"; title: string; text: string; itemId?: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
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
    const body = await req.json();
    const clientId: string = body.clientId;
    const question: string = (body.question ?? "").toString().trim();
    const deep = body.mode === "deep";
    const matchCount: number = deep ? 10 : 5;

    // Conversation memory: recent turns make follow-ups ("what about pricing?")
    // work. We use the last couple of questions to broaden retrieval, and replay
    // the turns to the model so it understands the thread.
    const history: { question?: string; answer?: string }[] = Array.isArray(body.history) ? body.history.slice(-4) : [];
    const recentQs = history.map((h) => (h?.question ?? "").toString()).filter(Boolean).slice(-2);
    const retrievalQuery = [...recentQs, question].join(" ").trim();

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
    let queryEmbedding: number[] = [];
    try {
      // deno-lint-ignore no-explicit-any
      const session = new (globalThis as any).Supabase.ai.Session("gte-small");
      queryEmbedding = (await session.run(retrievalQuery, { mean_pool: true, normalize: true })) as number[];
    } catch (e) {
      console.warn("vault-ask: question embedding failed, continuing without vector search:", e);
    }

    // ── Retrieve from all sources in parallel ───────────────────────────────────
    const [dnaRes, kbRes, sopRes, vaultRes] = await Promise.all([
      admin.from("company_dna").select("*").eq("client_id", clientId).maybeSingle(),
      admin.from("kb_entries").select("question, answer")
        .eq("client_id", clientId)
        .textSearch("fts", retrievalQuery, { type: "websearch", config: "english" })
        .limit(3),
      admin.from("sops").select("title, body")
        .eq("client_id", clientId)
        .textSearch("fts", retrievalQuery, { type: "websearch", config: "english" })
        .limit(2),
      queryEmbedding.length
        ? admin.rpc("match_vault_chunks", { p_client_id: clientId, p_query_embedding: queryEmbedding, p_match_count: matchCount })
        : Promise.resolve({ data: [], error: null }),
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

    // 2. Vault docs — semantic matches, grouped one block per document.
    type Match = { id: string; item_id: string; content: string; chunk_index: number; similarity: number };
    const matches = (vaultRes.error ? [] : (vaultRes.data ?? [])) as Match[];
    if (matches.length) {
      const itemIds = [...new Set(matches.map((c) => c.item_id))];
      const { data: itemRows } = await admin.from("vault_items").select("id, title").in("id", itemIds);
      const titleById = new Map<string, string>();
      for (const r of (itemRows ?? []) as { id: string; title: string }[]) titleById.set(r.id, r.title);
      const orderedIds: string[] = [];
      for (const c of matches) if (!orderedIds.includes(c.item_id)) orderedIds.push(c.item_id);
      for (const id of orderedIds) {
        const text = matches.filter((c) => c.item_id === id).map((c) => c.content.trim()).join("\n…\n");
        blocks.push({ kind: "vault", title: titleById.get(id) ?? "Untitled", text, itemId: id });
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

    if (!blocks.length) {
      await logQuery(0);
      return json({
        answer: "I don't have anything in the Vault that answers this yet. Add a relevant document (or fill in Company DNA), then it'll show up here.",
        sources: [], chunksUsed: 0,
      });
    }

    // ── Build grounded context + answer ─────────────────────────────────────────
    let context = "";
    blocks.forEach((b, i) => {
      context += `[${i + 1}] (${SOURCE_LABEL[b.kind]}) ${b.title}\n${b.text}\n\n`;
    });

    const chatRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://rapidtalportal.vercel.app",
        "X-Title": "RapidTal Portal",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        max_tokens: deep ? 1100 : 550,
        temperature: 0.4,
        messages: [
          { role: "system", content: deep ? DEEP_PROMPT : ANSWER_PROMPT },
          ...history.flatMap((h) => {
            const q = (h?.question ?? "").toString().trim();
            const a = (h?.answer ?? "").toString().trim().slice(0, 600);
            return q && a ? [{ role: "user", content: q }, { role: "assistant", content: a }] : [];
          }),
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` },
        ],
      }),
    });

    const chatJson = await chatRes.json();
    if (!chatRes.ok) {
      return json({ error: `Answer generation failed: ${chatJson?.error?.message ?? "unknown"}` }, 500);
    }

    const answer: string = chatJson.choices?.[0]?.message?.content?.trim() ?? "No answer generated.";
    const tokensUsed: number = chatJson.usage?.total_tokens ?? 0;

    const sources = blocks.map((b, i) => ({
      n: i + 1,
      kind: b.kind,
      kindLabel: SOURCE_LABEL[b.kind],
      title: b.title,
      itemId: b.itemId ?? null,
    }));

    await logQuery(blocks.length);
    return json({ answer, sources, chunksUsed: blocks.length, tokensUsed });
  } catch (error) {
    console.error("❌ vault-ask error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
