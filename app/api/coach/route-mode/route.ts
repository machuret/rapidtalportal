/**
 * POST /api/coach/route-mode — LLM coach-mode router.
 *
 * Classifies an unprompted Coach question into an action mode (or "private")
 * so the client can pick the right answer transport/schema BEFORE asking.
 * The result is advisory: it is validated against the role policy here, and
 * the edge function re-enforces role at generation/execution time.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { askVaultLimiter, tooManyRequests } from "@/lib/rate-limit";
import { routeModeWithLlm, routedModeAllowed } from "@/lib/coach/route-mode";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().trim().min(3).max(2000),
  coachRole: z.enum(["client", "va"]),
});

export const POST = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) {
    return NextResponse.json(
      { error: "Coach is unavailable while an administrator is viewing as another user." },
      { status: 409 },
    );
  }
  // Shares the ask quota — the router is part of the ask flow's LLM cost.
  const rl = await askVaultLimiter.check(`ask:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid route request." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const result = await routeModeWithLlm({
    question: parsed.data.question,
    coachRole: parsed.data.coachRole,
  });

  // The router may only suggest what this role may actually do.
  if (result.routed && !routedModeAllowed(result.mode, user.role)) {
    return NextResponse.json({ mode: "private", routed: false });
  }
  return NextResponse.json(result);
});
