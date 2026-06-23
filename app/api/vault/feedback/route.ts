/**
 * POST  /api/vault/feedback — record 👍/👎 on an Ask the Vault answer (any member).
 *   Includes the sources that produced the answer, so a 👎 can be traced back
 *   to the offending document.
 * PATCH /api/vault/feedback — mark a feedback row resolved (admins; review queue).
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const postSchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(20000),
  rating: z.union([z.literal(1), z.literal(-1)]),
  sources: z
    .array(z.object({
      kind: z.string().max(20),
      title: z.string().max(300),
      itemId: z.string().uuid().nullable().optional(),
    }))
    .max(20)
    .optional(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback." }, { status: 422 });

  const access = assertClientAccess(user, parsed.data.clientId);
  if (access) return access;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error } = await (admin as any).from("vault_feedback").insert({
    client_id: parsed.data.clientId,
    user_id: user.id,
    question: parsed.data.question,
    answer: parsed.data.answer,
    rating: parsed.data.rating,
    sources: parsed.data.sources ?? [],
  });

  // Pre-027 fallback: retry without the sources column so feedback never breaks.
  if (error && /sources/.test(error.message ?? "")) {
    // eslint-disable-next-line no-extra-semi, @typescript-eslint/no-explicit-any
    ;({ error } = await (admin as any).from("vault_feedback").insert({
      client_id: parsed.data.clientId,
      user_id: user.id,
      question: parsed.data.question,
      answer: parsed.data.answer,
      rating: parsed.data.rating,
    }));
  }

  if (error) {
    console.error("[vault/feedback POST]", error.message);
    return serverError(error);
  }

  // Fold Ask-the-Vault feedback into the unified Brain learning loop, so the
  // Brain learns from answers too — not just content topics. Best-effort.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("brain_signals").insert({
      client_id: parsed.data.clientId,
      user_id: user.id,
      surface: "vault_answer",
      artifact_text: parsed.data.answer.slice(0, 8000),
      rating: parsed.data.rating,
      context: { question: parsed.data.question, sources: parsed.data.sources ?? [] },
    });
  } catch (e) {
    console.error("[vault/feedback POST] brain_signals dual-write failed", e);
  }

  return NextResponse.json({ success: true });
});

const patchSchema = z.object({
  clientId: z.string().uuid(),
  id: z.string().uuid(),
  resolved: z.boolean(),
});

export const PATCH = withAuth(
  async (req, { user }) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

    const access = assertClientAccess(user, parsed.data.clientId);
    if (access) return access;

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("vault_feedback")
      .update({ resolved: parsed.data.resolved })
      .eq("id", parsed.data.id)
      .eq("client_id", parsed.data.clientId);

    if (error) {
      console.error("[vault/feedback PATCH]", error.message);
      return serverError(error);
    }
    return NextResponse.json({ success: true });
  },
  { roles: ["client_admin", "super_admin"] },
);
