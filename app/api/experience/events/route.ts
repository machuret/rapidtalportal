import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientExperienceLimiter, tooManyRequests } from "@/lib/rate-limit";
import { CLIENT_EXPERIENCE_EVENTS } from "@/lib/client-experience";

const metadataValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);
const schema = z.object({
  eventType: z.enum(CLIENT_EXPERIENCE_EVENTS),
  path: z.string().startsWith("/").max(300),
  durationMs: z.number().int().min(0).max(300_000).optional(),
  metadata: z.record(z.string().max(80), metadataValue).optional(),
}).strict();

export const POST = withAuth(async (request, { user }) => {
  if (!user.client_id) return new NextResponse(null, { status: 204 });

  const rate = await clientExperienceLimiter.check(`experience:${user.id}`);
  if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid experience event." }, { status: 422 });

  const admin = createAdminClient();
  const { error } = await admin.from("portal_experience_events").insert({
    client_id: user.client_id,
    user_id: user.id,
    event_type: parsed.data.eventType,
    path: parsed.data.path,
    duration_ms: parsed.data.durationMs ?? null,
    metadata: parsed.data.metadata ?? {},
  });
  if (error) throw error;

  return new NextResponse(null, { status: 204 });
});
