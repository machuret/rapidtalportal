import { handleOptions, jsonResponse as json } from "../_shared/cors.ts";
import { authorizeRequest } from "../_shared/auth.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Super-admin only; a trusted server-to-server call may present the
  // service-role key as its token to bypass the user checks.
  const auth = await authorizeRequest(request, {
    allowServiceKey: true,
    requireSuperAdmin: true,
    select: "role",
  });
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  let input: { versionId?: string; limit?: number } = {};
  try { input = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const limit = Math.max(1, Math.min(Number(input.limit) || 60, 200));
  let query = admin.from("business_library_chunks")
    .select("id,content,embedding_attempts,version_id")
    .is("embedding", null).order("created_at", { ascending: true }).limit(limit);
  if (input.versionId) query = query.eq("version_id", input.versionId);
  const chunks = await query;
  if (chunks.error) return json({ error: "Library chunks could not be claimed.", recoverable: true }, 503);

  let session: { run: (text: string, options: Record<string, unknown>) => Promise<unknown> };
  try {
    // deno-lint-ignore no-explicit-any
    session = new (globalThis as any).Supabase.ai.Session("gte-small");
  } catch {
    return json({ error: "Semantic index model is temporarily unavailable.", recoverable: true }, 503);
  }

  let indexed = 0;
  let failed = 0;
  for (const chunk of chunks.data ?? []) {
    try {
      const embedding = await session.run(chunk.content, { mean_pool: true, normalize: true }) as number[];
      const updated = await admin.from("business_library_chunks").update({
        embedding: JSON.stringify(embedding), embedding_model: "gte-small-v1",
        embedded_at: new Date().toISOString(), embedding_error: null,
        embedding_attempts: Math.min(100, (chunk.embedding_attempts ?? 0) + 1),
      }).eq("id", chunk.id).is("embedding", null).select("id").maybeSingle();
      if (updated.error) throw updated.error;
      if (updated.data) indexed++;
    } catch (error) {
      failed++;
      await admin.from("business_library_chunks").update({
        embedding_error: error instanceof Error ? error.message.slice(0, 1000) : "Embedding failed",
        embedding_attempts: Math.min(100, (chunk.embedding_attempts ?? 0) + 1),
      }).eq("id", chunk.id);
    }
  }
  let remainingQuery = admin.from("business_library_chunks")
    .select("id", { count: "exact", head: true }).is("embedding", null);
  if (input.versionId) remainingQuery = remainingQuery.eq("version_id", input.versionId);
  const remaining = await remainingQuery;
  const remainingCount = remaining.count ?? 0;
  return json({ ok: failed === 0 && remainingCount === 0, indexed, failed, remaining: remainingCount }, failed ? 207 : 200);
});
