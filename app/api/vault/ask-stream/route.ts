/**
 * POST /api/vault/ask-stream — streaming (SSE) variant of Ask the Vault.
 * Pipes OpenRouter tokens through; the client falls back to /api/vault/ask
 * (non-streaming) if this ever fails or the gateway buffers.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, assertClientAccess } from "@/lib/api-auth";
import { streamEdgeFunction } from "@/lib/edge-proxy";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(3).max(2000),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 422 });

  const access = assertClientAccess(auth.user, parsed.data.clientId);
  if (access) return access;

  return streamEdgeFunction("vault-ask", {
    clientId: parsed.data.clientId,
    question: parsed.data.question,
    history: parsed.data.history ?? [],
    stream: true,
  });
}
