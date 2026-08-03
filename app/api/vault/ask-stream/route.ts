/**
 * POST /api/vault/ask-stream — streaming (SSE) variant of Ask the Brain.
 * Pipes OpenRouter tokens through; the client falls back to /api/vault/ask
 * (non-streaming) if this ever fails or the gateway buffers.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { streamEdgeFunction } from "@/lib/edge-proxy";
import { askVaultLimiter, tooManyRequests } from "@/lib/rate-limit";
import { coachModeSchema } from "@/lib/brain/coach-action-policy";
import { COACH_PAGE_CONTEXT_KEYS, type CoachPageContextKey } from "@/supabase/functions/_shared/coach-page-context";

// Deep mode streams a stronger model's long answer — give it room past Vercel's
// short default so a slow generation isn't cut off mid-stream.
export const maxDuration = 60;

const bodySchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(3).max(8000),
  mode: z.enum(["concise", "deep"]).optional(),
  coachMode: coachModeSchema.optional(),
  surface: z.enum(["vault_answer", "compose"]).optional(),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  pageContext: z.string().refine(
    (value): value is CoachPageContextKey => COACH_PAGE_CONTEXT_KEYS.includes(value as CoachPageContextKey),
    "Unknown page context.",
  ).optional(),
});

export const POST = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) {
    return NextResponse.json(
      { error: "Coach is unavailable while an administrator is viewing as another user." },
      { status: 409 },
    );
  }
  // Shares the ask quota with /api/vault/ask — same user, same OpenRouter cost.
  const rl = await askVaultLimiter.check(`ask:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 422 });

  const access = assertClientAccess(user, parsed.data.clientId);
  if (access) return access;

  return streamEdgeFunction("vault-ask", {
    clientId: parsed.data.clientId,
    question: parsed.data.question,
    mode: parsed.data.mode ?? "concise",
    coachMode: parsed.data.coachMode ?? "private",
    surface: parsed.data.surface ?? "vault_answer",
    history: parsed.data.history ?? [],
    pageContext: parsed.data.pageContext,
    stream: true,
  });
});
