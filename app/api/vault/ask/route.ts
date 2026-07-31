/**
 * POST /api/vault/ask — Ask the Brain (retrieval-augmented Q&A).
 * Proxies to the vault-ask edge function with the caller's verified JWT.
 * Auth: withAuth — any authenticated user with access to the client.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { askVaultLimiter, tooManyRequests } from "@/lib/rate-limit";

// Deep mode runs a stronger model over whole documents — it can take 20-40s, so
// lift the function timeout well above Vercel's short default or the answer 504s.
export const maxDuration = 60;

const bodySchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(3).max(8000),
  // "Go deeper" sends mode:"deep"; follow-ups send prior turns. Both were being
  // silently dropped here (schema stripped them, the proxy forwarded only
  // clientId+question), so deep answers were really just concise re-asks.
  mode: z.enum(["concise", "deep"]).optional(),
  surface: z.enum(["vault_answer", "compose"]).optional(),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export const POST = withAuth(async (req, { user }) => {
  // Each question costs an OpenRouter call — throttle per user.
  const rl = askVaultLimiter.check(`ask:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A question (3+ characters) and clientId are required." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  return proxyToEdgeFunction("vault-ask", {
    clientId: parsed.data.clientId,
    question: parsed.data.question,
    mode: parsed.data.mode ?? "concise",
    surface: parsed.data.surface ?? "vault_answer",
    history: parsed.data.history ?? [],
  });
});
