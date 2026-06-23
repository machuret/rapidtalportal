/**
 * GET/PATCH /api/profile/notifications — the caller's own notification
 * preferences (which categories they get, per channel). Defaults are ON, so an
 * empty object means "everything", and users only persist what they turn off.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-categories";

const KNOWN = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));

const channelSchema = z.object({ in_app: z.boolean().optional(), email: z.boolean().optional() });
const patchSchema = z.object({ prefs: z.record(z.string(), channelSchema) });

export const GET = withAuth(async (_req, { user }) => {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any).from("users").select("notification_prefs").eq("id", user.id).single();
  return NextResponse.json({ prefs: data?.notification_prefs ?? {} });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  // Drop any unknown category keys before persisting.
  const clean = Object.fromEntries(Object.entries(parsed.data.prefs).filter(([k]) => KNOWN.has(k)));

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("users").update({ notification_prefs: clean }).eq("id", user.id);
  if (error) return serverError(error);
  return NextResponse.json({ prefs: clean });
});
