import { NextRequest, NextResponse } from "next/server";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { requireApiAuth } from "@/lib/api-auth";
import { originRejected } from "@/lib/api/csrf";
import { messageSendLimiter, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Bypasses withAuth (proxies to the edge function, which verifies JWT + tenant),
  // so run the CSRF origin check explicitly. Sending fans out in-app + email
  // notifications, so also rate-limit per caller to close the email-bomb vector.
  if (originRejected(req)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const rl = messageSendLimiter.check(`msg:${auth.user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);
  const body = await req.json();
  return proxyToEdgeFunction("send-message", body);
}
