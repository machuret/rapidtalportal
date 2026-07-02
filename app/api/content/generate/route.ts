/**
 * POST /api/content/generate — proxy to the content-generate edge function.
 * Auth is enforced at both hops: proxyToEdgeFunction verifies the caller via
 * getUser() before forwarding, and the edge function re-checks role and tenant
 * membership (client_id). Not an open route despite the thin body.
 *
 * After the edge function returns, we record the AI's first draft on the piece
 * (ai_original) so the Brain can later measure how much a human rewrote it
 * before approving — see Milestone D (learn from real outcomes). Best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { originRejected } from "@/lib/api/csrf";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Bypasses withAuth (proxies to the edge function, which verifies JWT + role +
  // tenant), so run withAuth's CSRF origin check explicitly here.
  if (originRejected(req)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  // Content generation is a paid LLM call — rate-limit per caller so it can't be
  // hammered into an unbounded bill. Resolve identity here (the proxy re-verifies).
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const rl = aiGenerateLimiter.check(`content:${auth.user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);
  const body = await req.json();
  const resp = await proxyToEdgeFunction("content-generate", body);

  try {
    const data = await resp.clone().json();
    if (data?.success && data.id && typeof data.body === "string" && body?.clientId) {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("content_pieces")
        .update({ ai_original: data.body })
        .eq("id", data.id)
        .eq("client_id", body.clientId);
    }
  } catch (e) {
    console.error("[content/generate] ai_original capture failed", e);
  }

  return resp;
}
