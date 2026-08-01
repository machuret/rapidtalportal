import { NextResponse } from "next/server";
import { z } from "zod";
import { serverError } from "@/lib/api/errors";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "planned", "published", "dismissed"]),
});

export const GET = withSuperAdmin(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 140 precedes generated types
  const db = createAdminClient() as any;
  const [chunks, gaps, signals] = await Promise.all([
    db.from("business_library_chunks")
      .select("id,embedded_at,embedding_error"),
    db.from("business_library_gap_suggestions")
      .select("id,client_id,coach_role,topic,detail,status,consented_at,created_at,updated_at")
      .order("created_at", { ascending: false }).limit(100),
    db.from("brain_signals")
      .select("rating")
      .eq("surface", "vault_answer").eq("visibility", "private_coach")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(10000),
  ]);
  if (chunks.error) return serverError(chunks.error);
  if (gaps.error) return serverError(gaps.error);
  if (signals.error) return serverError(signals.error);

  const chunkRows = chunks.data ?? [];
  const signalRows = signals.data ?? [];
  const positive = signalRows.filter((row: { rating: number }) => row.rating === 1).length;
  const negative = signalRows.filter((row: { rating: number }) => row.rating === -1).length;
  return NextResponse.json({
    index: {
      total: chunkRows.length,
      embedded: chunkRows.filter((row: { embedded_at: string | null }) => Boolean(row.embedded_at)).length,
      failed: chunkRows.filter((row: { embedding_error: string | null }) => Boolean(row.embedding_error)).length,
    },
    coachFeedback: {
      windowDays: 30,
      positive,
      negative,
      satisfaction: positive + negative ? Math.round((positive / (positive + negative)) * 100) : null,
    },
    suggestions: gaps.data ?? [],
    privacy: "Only aggregate private-Coach ratings and explicitly consented topics are shown.",
  });
});

export const PATCH = withSuperAdmin(async (request) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid suggestion update." }, { status: 422 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 140 precedes generated types
  const db = createAdminClient() as any;
  const result = await db.from("business_library_gap_suggestions")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id,status,updated_at").maybeSingle();
  if (result.error) return serverError(result.error);
  if (!result.data) return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  return NextResponse.json({ suggestion: result.data });
});
