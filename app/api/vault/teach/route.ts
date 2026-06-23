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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("kb_entries").insert({
    client_id: parsed.data.clientId,
    question: parsed.data.question.trim(),
    answer: parsed.data.answer.trim(),
    category: "Taught",
    is_pinned: true, // human knowledge — regeneration must not wipe it
  });
  if (error) {
    console.error("[vault/teach]", error.message);
    return serverError(error);
  }

  // Close matching gaps in the query log (best-effort).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("vault_queries")
      .update({ answered: true })
      .eq("client_id", parsed.data.clientId)
      .eq("answered", false)
      .ilike("question", parsed.data.question.trim());
  } catch { /* table may not exist yet */ }

  return NextResponse.json({ success: true });
});
