import { handleOptions, jsonResponse as json } from "../_shared/cors.ts";
import { authorizeRequest } from "../_shared/auth.ts";

/**
 * brain-embed — tiny embedding proxy for the Node (Next.js) Brain resolver.
 *
 * The Deno-only `Supabase.ai.Session("gte-small")` API produces the 384-dim
 * vectors that Vault/Library retrieval (`match_vault_chunks`,
 * `match_business_library_chunks_hybrid`) expects. Node cannot call that API,
 * so Next-side surfaces POST `{ query }` here with the service-role key and get
 * back `{ embedding }`. Any authenticated user JWT is also accepted — the
 * output is content-free (just a vector), so no client scoping is needed.
 */
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Internal path: the Next server presents the service-role key. A normal
  // user JWT is fine too — embeddings are content-free.
  const auth = await authorizeRequest(request, { allowServiceKey: true });
  if (!auth.ok) return auth.response;

  let body: { query?: unknown } = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  // Keep-warm ping — boots the isolate AND loads the gte-small model so real
  // queries are fast. Same pattern as vault-ask.
  if ((body as { ping?: unknown })?.ping) {
    try {
      // deno-lint-ignore no-explicit-any
      const s = new (globalThis as any).Supabase.ai.Session("gte-small");
      await s.run("warm", { mean_pool: true, normalize: true });
    } catch (_e) { /* ignore */ }
    return json({ ok: true });
  }

  const query = body.query;
  if (typeof query !== "string" || query.trim().length < 1 || query.length > 2_000) {
    return json({ error: "query must be a string of 1-2000 characters." }, 400);
  }

  let session: { run: (text: string, options: Record<string, unknown>) => Promise<unknown> };
  try {
    // deno-lint-ignore no-explicit-any
    session = new (globalThis as any).Supabase.ai.Session("gte-small");
  } catch (error) {
    console.error("brain-embed: gte-small session unavailable", error);
    return json({ error: "Embedding model is temporarily unavailable.", recoverable: true }, 500);
  }

  try {
    const embedding = await session.run(query, { mean_pool: true, normalize: true }) as number[];
    return json({ embedding });
  } catch (error) {
    console.error("brain-embed: embedding failed", error);
    return json({ error: "Embedding failed.", recoverable: true }, 500);
  }
});
