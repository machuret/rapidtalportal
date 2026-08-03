import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { originRejected } from "@/lib/api/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";

const eventSchema = z.object({
  clientId: z.string().uuid(),
  step: z.enum(["company", "documents", "voice", "coach", "draft", "task"]).nullable().optional(),
  eventType: z.enum(["journey_viewed", "step_viewed"]),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default({}),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  if (originRejected(req)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid onboarding event." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const admin = createAdminClient();
  // React remounts and browser refreshes should not turn a page view into a
  // burst of duplicate funnel events. The bucket is calculated server-side so
  // clients cannot choose their own dedupe identity.
  const fiveMinuteBucket = Math.floor(Date.now() / (5 * 60 * 1_000));
  const dedupeKey = createHash("sha256").update([
    parsed.data.clientId,
    user.id,
    parsed.data.eventType,
    parsed.data.step ?? "journey",
    String(fiveMinuteBucket),
  ].join(":"), "utf8").digest("hex");
  const { error } = await (admin as unknown as {
    from: (table: string) => {
      upsert: (
        value: Record<string, unknown>,
        options: { onConflict: string; ignoreDuplicates: boolean },
      ) => Promise<{ error: unknown }>;
    };
  }).from("client_onboarding_events").upsert({
    client_id: parsed.data.clientId,
    user_id: user.id,
    step: parsed.data.step ?? null,
    event_type: parsed.data.eventType,
    dedupe_key: dedupeKey,
    metadata: parsed.data.metadata,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) return serverError(error);
  return NextResponse.json({ recorded: true }, { status: 201 });
});
