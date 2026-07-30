/**
 * POST /api/vault/teach — capture knowledge at the moment a gap is found.
 *
 * When Ask the Vault can't answer, anyone on the team who knows the answer can
 * teach it inline. The answer becomes a pinned KB entry (category "Taught") so
 * the next person who asks gets it, and matching unanswered query-log rows are
 * marked answered so the gap closes.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({
  clientId: z.string().uuid(),
  gapId: z.string().uuid().optional(),
  question: z.string().min(3).max(2000),
  answer: z.string().min(3).max(20000),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const access = assertClientAccess(user, parsed.data.clientId);
  if (access) return access;

  const admin = createAdminClient();
  // vault_queries is introduced after the checked-in generated schema snapshot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  let gapId = parsed.data.gapId;
  if (!gapId) {
    const { data: gap, error: gapError } = await db
      .from("vault_queries")
      .select("id")
      .eq("client_id", parsed.data.clientId)
      .in("gap_status", ["open", "in_review"])
      .ilike("question", parsed.data.question.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gapError) return serverError(gapError);
    gapId = gap?.id;
  }
  if (!gapId) {
    return NextResponse.json({ error: "This knowledge gap is no longer open." }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kbEntryId, error } = await db.rpc("resolve_vault_gap_with_answer", {
    p_gap_id: gapId,
    p_client_id: parsed.data.clientId,
    p_actor_id: user.id,
    p_answer: parsed.data.answer.trim(),
  });
  if (error) {
    console.error("[vault/teach]", error.message);
    return serverError(error);
  }

  return NextResponse.json({ success: true, kbEntryId });
}, { roles: ["client_admin", "super_admin"] });
