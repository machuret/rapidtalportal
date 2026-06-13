/**
 * POST /api/vault/ask-stream — streaming (SSE) variant of Ask the Vault.
 * Pipes OpenRouter tokens through; the client falls back to /api/vault/ask
 * (non-streaming) if this ever fails or the gateway buffers.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { streamEdgeFunction } from "@/lib/edge-proxy";
import { askVaultLimiter, tooManyRequests } from "@/lib/rate-limit";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(3).max(8000),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export const POST = withAuth(async (req, { user }) => {
  // Shares the ask quota with /api/vault/ask — same user, same OpenRouter cost.
  const rl = askVaultLimiter.check(`ask:${user.id}`);
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
    history: parsed.data.history ?? [],
    stream: true,
  });
});
