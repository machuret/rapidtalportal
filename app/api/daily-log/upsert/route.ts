import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInTimezone } from "@/lib/date-tz";

const schema = z.object({
  log_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks_done:     z.string().max(5000).optional().default(""),
  positives:      z.string().max(5000).optional().default(""),
  challenges:     z.string().max(5000).optional().default(""),
  goals_achieved: z.string().max(5000).optional().default(""),
  goals_tomorrow: z.string().max(5000).optional().default(""),
  mood:           z.enum(["great","good","neutral","difficult","overwhelmed"]).nullable().optional(),
});

export const POST = withAuth(async (req, { user }) => {
  if (!user.client_id) return NextResponse.json({ error: "No client." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();

  // VAs may only write today's log — prevents backdating / future-dating entries.
  // Admins (client_admin, super_admin) are exempt so they can backfill if needed.
  // "Today" is computed in the VA's own timezone, not the server's UTC, so a VA
  // east/west of UTC isn't wrongly blocked around the day boundary.
  const isAdmin = user.role === "client_admin" || user.role === "super_admin";
  if (!isAdmin) {
    const { data: me } = await admin.from("users").select("timezone").eq("id", user.id).maybeSingle();
    const tz = (me as { timezone: string | null } | null)?.timezone ?? null;
    const today = todayInTimezone(tz);
    if (parsed.data.log_date !== today) {
      return NextResponse.json(
        { error: `Logs can only be submitted for today (${today}).` },
        { status: 403 }
      );
    }
  }

  const { data, error } = await admin
    .from("daily_logs")
    .upsert({
      client_id:      user.client_id,
      user_id:        user.id,
      log_date:       parsed.data.log_date,
      tasks_done:     parsed.data.tasks_done,
      positives:      parsed.data.positives,
      challenges:     parsed.data.challenges,
      goals_achieved: parsed.data.goals_achieved,
      goals_tomorrow: parsed.data.goals_tomorrow,
      mood:           parsed.data.mood ?? null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: "user_id,log_date" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
});
