import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";

const bodySchema = z.object({
  clientId: z.string().uuid(),
  customCategories: z.array(z.string()).optional(),
});

export const POST = withAuth(async (req, { user }) => {
  // Only client_admin and super_admin can trigger KB generation
  if (user.role === "va") {
    return NextResponse.json({ error: "Forbidden. Only admins can regenerate the knowledge base." }, { status: 403 });
  }

  const rl = await aiGenerateLimiter.check(`kb:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid clientId." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  return proxyToEdgeFunction("kb-generate", { clientId: parsed.data.clientId, customCategories: parsed.data.customCategories });
});
