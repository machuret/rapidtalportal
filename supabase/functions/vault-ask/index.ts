/**
 * vault-ask — Retrieval-augmented Q&A over a client's Vault ("Ask the Vault")
 *
 * Flow:
 *   1. Embed the user's question (Supabase gte-small, 384-dim).
 *   2. Retrieve the most similar vault_chunks for the client (match_vault_chunks RPC).
 *   3. Answer via OpenRouter (openai/gpt-4o-mini), grounded ONLY in retrieved chunks, with citations.
 *
 * Called by: /api/vault/ask (proxied with the end-user's JWT).
 *
 * DB Reads:  vault_chunks (via RPC), vault_items (titles for citations)
 * DB Writes: none
 *
 * Auth:    Bearer JWT → getUser() → DB user row → client membership check
 * Secrets: OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANSWER_PROMPT = `You are the company "brain" — you answer a virtual assistant's questions using ONLY the company knowledge provided in the context below.

Rules:
- Answer strictly from the provided context. Do NOT use outside knowledge or invent facts.
- If the context does not contain the answer, say so plainly: "I don't have that in the Vault yet." Then suggest what document the team could add.
- Be concise and practical — a VA should be able to act on it immediately.
- When you use a fact, cite the source document by its [n] number, e.g. "Refunds take 5 days [2]."
- Prefer specifics (names, numbers, steps, URLs) found in the context.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    const { data: userRow } = await admin
      .from("users")
      .select("role, client_id")
      .eq("id", authUser.id)
      .single();
    if (!userRow) return json({ error: "User record not found." }, 403);

    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;

    // ── Input ─────────────────────────────────────────────────────────────────
    const body = await req.json();
    const clientId: string = body.clientId;
    const question: string = (body.question ?? "").toString().trim();
    const matchCount: number = Math.min(Math.max(Number(body.matchCount) || 8, 1), 15);

    if (!clientId || !question) return json({ error: "Missing clientId or question." }, 400);
    if (question.length < 3) return json({ error: "Question too short." }, 422);

    if (role !== "super_admin" && userClientId !== clientId) {
      return json({ error: "Forbidden." }, 403);
    }

    // ── 1. Embed the question (Supabase gte-small, 384-dim — must match the
    //       model used to embed chunks in vault-process) ─────────────────────────
    let queryEmbedding: number[] = [];
    try {
      // deno-lint-ignore no-explicit-any
      const session = new (globalThis as any).Supabase.ai.Session("gte-small");
      queryEmbedding = (await session.run(question, { mean_pool: true, normalize: true })) as number[];
    } catch (e) {
      return json({ error: `Embedding failed: ${e instanceof Error ? e.message : e}` }, 500);
    }
    if (!queryEmbedding.length) return json({ error: "Could not embed question." }, 500);

    // ── 2. Retrieve similar chunks ──────────────────────────────────────────────
    const { data: matches, error: matchErr } = await admin.rpc("match_vault_chunks", {
      p_client_id: clientId,
      p_query_embedding: queryEmbedding,
      p_match_count: matchCount,
    });

    if (matchErr) {
      console.error("match_vault_chunks error:", matchErr);
      return json({ error: "Search failed. Has the Vault been indexed yet?" }, 500);
    }

    type Match = { id: string; item_id: string; content: string; chunk_index: number; similarity: number };
    const chunks = (matches ?? []) as Match[];

    if (!chunks.length) {
      return json({
        answer: "I don't have anything in the Vault that answers this yet. Add a relevant document, then reprocess it so I can learn from it.",
        sources: [],
        chunksUsed: 0,
      });
    }

    // ── Map chunks → source documents (for citations) ───────────────────────────
    const itemIds = [...new Set(chunks.map((c) => c.item_id))];
    const { data: itemRows } = await admin
      .from("vault_items")
      .select("id, title, category")
      .in("id", itemIds);
    const titleById = new Map<string, { title: string; category: string | null }>();
    for (const r of (itemRows ?? []) as { id: string; title: string; category: string | null }[]) {
      titleById.set(r.id, { title: r.title, category: r.category });
    }

    // Stable citation numbering: one [n] per source document, ordered by best match.
    const orderedItemIds: string[] = [];
    for (const c of chunks) if (!orderedItemIds.includes(c.item_id)) orderedItemIds.push(c.item_id);
    const citationNum = new Map<string, number>();
    orderedItemIds.forEach((id, i) => citationNum.set(id, i + 1));

    // ── 3. Build grounded context + answer ──────────────────────────────────────
    let context = "";
    for (const c of chunks) {
      const n = citationNum.get(c.item_id)!;
      const title = titleById.get(c.item_id)?.title ?? "Untitled";
      context += `[${n}] ${title}\n${c.content.trim()}\n\n`;
    }

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
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          { role: "system", content: ANSWER_PROMPT },
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

    const sources = orderedItemIds.map((id) => ({
      n: citationNum.get(id)!,
      itemId: id,
      title: titleById.get(id)?.title ?? "Untitled",
      category: titleById.get(id)?.category ?? null,
      similarity: Math.max(...chunks.filter((c) => c.item_id === id).map((c) => c.similarity)),
    }));

    return json({ answer, sources, chunksUsed: chunks.length, tokensUsed });
  } catch (error) {
    console.error("❌ vault-ask error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
