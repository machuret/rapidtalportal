/**
 * POST /api/errors — browser error reports (window.onerror / unhandled
 * rejections). Authenticated + rate-limited so it can't be used to flood the
 * error table.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { captureError } from "@/lib/error-tracking";
import { clientErrorLimiter, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
});

export const POST = withAuth(async (req, { user }) => {
  const rl = await clientErrorLimiter.check(`errors:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const err = new Error(parsed.data.message);
  err.stack = parsed.data.stack;
  captureError("client", err, { userId: user.id, clientId: user.client_id, url: parsed.data.url });

  return NextResponse.json({ ok: true });
});
