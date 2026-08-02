import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { EDITORIAL_DIMENSIONS } from "@/lib/brain/editorial-learning";

/**
 * Brain signals — the learning input. Any AI surface posts a 👍 / 👎 (with an
 * optional reason) here; the Brain conditions future generations on them
 * the official shared Brain Context resolver and later distils them into
 * curated memory.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A team-visible 👎 on a Vault answer also lands in the Answers-to-review queue
 * (vault_feedback), so admins can trace and fix the source — the signal alone
 * only feeds distillation. Hard privacy boundary: `private_coach` feedback
 * stays out of the team queue. Best-effort: a queue failure logs and never
 * breaks the signal write. Re-rating the same artifact updates the existing
 * unresolved row (matched on question + answer) instead of duplicating it.
 */
async function queueDownvoteForReview(
  admin: AdminClient,
  input: {
    clientId: string;
    userId: string;
    surface: string;
    rating: 1 | -1;
    answer: string;
    context: Record<string, unknown>;
  },
) {
  if (input.rating !== -1 || input.surface !== "vault_answer") return;
  if (input.context.visibility === "private_coach") return;
  const rawQuestion = input.context.question;
  const question = typeof rawQuestion === "string" ? rawQuestion.trim().slice(0, 2000) : "";
  if (!question) return;
  const answer = input.answer.slice(0, 8000);
  const sources = (Array.isArray(input.context.sources) ? input.context.sources : []) as Json;
  try {
    const { data: prior, error: lookupError } = await admin
      .from("vault_feedback").select("id")
      .eq("client_id", input.clientId).eq("question", question).eq("answer", answer)
      .eq("resolved", false)
      .order("created_at", { ascending: false }).limit(1);
    if (lookupError) throw lookupError;
    const existing = (prior ?? [])[0] as { id: string } | undefined;
    if (existing) {
      const { error } = await admin
        .from("vault_feedback")
        .update({ rating: -1, sources, user_id: input.userId, created_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }
    const { error } = await admin.from("vault_feedback").insert({
      client_id: input.clientId,
      user_id: input.userId,
      question,
      answer,
      rating: -1,
      sources,
      resolved: false,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[brain/signals vault_feedback dual-write]", e);
  }
}

const createSchema = z.object({
  client_id:     z.string().uuid(),
  surface:       z.enum(["content_topic", "vault_answer", "compose", "tool", "content_draft", "kb"]),
  artifact_id:   z.string().uuid().optional().nullable(),
  artifact_text: z.string().min(1).max(8000),
  rating:        z.union([z.literal(1), z.literal(-1)]),
  reason:        z.string().max(2000).optional().nullable(),
  dimensions:    z.array(z.enum(EDITORIAL_DIMENSIONS)).max(12).optional().default([]),
  channel:       z.enum(["linkedin", "facebook", "instagram", "email", "blog", "newsletter"]).optional().nullable(),
  content_type:  z.string().trim().min(1).max(120).optional().nullable(),
  context:       z.record(z.string(), z.unknown()).optional().default({}),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const visibility = parsed.data.context?.visibility === "private_coach"
    ? "private_coach"
    : "team_learning";

  // Re-rating the same artifact updates the existing signal instead of inserting
  // a duplicate (which would inflate source_count and re-distil the same input).
  // created_at is bumped + distilled_at cleared so the change is re-distilled.
  if (parsed.data.artifact_id) {
    const { data: prior } = await admin
      .from("brain_signals").select("id")
      .eq("user_id", user.id).eq("surface", parsed.data.surface).eq("artifact_id", parsed.data.artifact_id)
      .order("created_at", { ascending: false }).limit(1);
    const existing = (prior ?? [])[0] as { id: string } | undefined;
    if (existing) {
      const { data, error } = await admin
        .from("brain_signals")
        .update({
          rating:        parsed.data.rating,
          reason:        parsed.data.reason ?? null,
          artifact_text: parsed.data.artifact_text,
          context:       (parsed.data.context ?? {}) as Json,
          dimensions:    parsed.data.dimensions,
          channel:       parsed.data.channel ?? null,
          content_type:  parsed.data.content_type ?? null,
          learning_intent: "explicit_feedback",
          visibility,
          distilled_at:  null,
          // Invalidate an in-flight distillation of the old judgement. Its
          // transactional commit will lose ownership and roll back.
          distill_claim_token: null,
          distill_claim_until: null,
          created_at:    new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) {
        console.error("[brain/signals re-rate]", error.code, error.message);
        return serverError(error);
      }
      await queueDownvoteForReview(admin, {
        clientId: parsed.data.client_id,
        userId: user.id,
        surface: parsed.data.surface,
        rating: parsed.data.rating,
        answer: parsed.data.artifact_text,
        context: parsed.data.context ?? {},
      });
      return NextResponse.json(data, { status: 200 });
    }
  }

  const { data, error } = await admin
    .from("brain_signals")
    .insert({
      client_id:     parsed.data.client_id,
      user_id:       user.id,
      surface:       parsed.data.surface,
      artifact_id:   parsed.data.artifact_id ?? null,
      artifact_text: parsed.data.artifact_text,
      rating:        parsed.data.rating,
      reason:        parsed.data.reason ?? null,
      context:       (parsed.data.context ?? {}) as Json,
      dimensions:    parsed.data.dimensions,
      channel:       parsed.data.channel ?? null,
      content_type:  parsed.data.content_type ?? null,
      learning_intent: "explicit_feedback",
      visibility,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[brain/signals POST]", error.code, error.message);
    return serverError(error);
  }
  await queueDownvoteForReview(admin, {
    clientId: parsed.data.client_id,
    userId: user.id,
    surface: parsed.data.surface,
    rating: parsed.data.rating,
    answer: parsed.data.artifact_text,
    context: parsed.data.context ?? {},
  });
  return NextResponse.json(data, { status: 201 });
});
