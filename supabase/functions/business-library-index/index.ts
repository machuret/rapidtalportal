import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://rapidtal.online",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const jwt = authHeader.slice(7);
  const admin = createClient(supabaseUrl, serviceKey);
  const internal = jwt === serviceKey;
  if (!internal) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return json({ error: "Unauthorized." }, 401);
    const actor = await admin.from("users").select("role").eq("id", user.id).single();
    if (actor.error || actor.data?.role !== "super_admin") return json({ error: "Forbidden." }, 403);
  }

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
