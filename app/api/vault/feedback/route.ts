/**
 * POST /api/vault/feedback — record 👍/👎 on an Ask the Vault answer.
 * Any authenticated member of the client may rate. Feeds the quality flywheel.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(20000),
  rating: z.union([z.literal(1), z.literal(-1)]),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback." }, { status: 422 });

  const access = assertClientAccess(user, parsed.data.clientId);
  if (access) return access;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("vault_feedback").insert({
    client_id: parsed.data.clientId,
    user_id: user.id,
    question: parsed.data.question,
    answer: parsed.data.answer,
    rating: parsed.data.rating,
  });
  if (error) {
    console.error("[vault/feedback]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
});
