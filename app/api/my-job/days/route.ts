/**
 * /api/my-job/days — the VA's days-worked log (feeds the monthly summary).
 * GET ?from=&to= → the caller's logged days in a range.
 * POST {work_date, hours?, note?} → log/replace a day (upsert by date).
 * DELETE ?date= → remove a logged day.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  const admin = createAdminClient();
  // Cap the unwindowed read (~3 years of days); document generators pass an
  // explicit from/to month window so they're unaffected by the limit.
  let q = admin.from("va_days_worked").select("*").eq("user_id", user.id).order("work_date", { ascending: false }).limit(1000);
  if (from) q = q.gte("work_date", from);
  if (to) q = q.lte("work_date", to);
  const { data } = await q;
  return NextResponse.json({ days: data ?? [] });
});

const postSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive().max(24).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pick a valid date." }, { status: 422 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("va_days_worked")
    .upsert({ user_id: user.id, client_id: user.client_id, ...parsed.data }, { onConflict: "user_id,work_date" })
    .select("*")
    .single();
  if (error) return serverError(error);
  return NextResponse.json({ day: data });
});

export const DELETE = withAuth(async (req, { user }) => {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Missing or invalid date." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("va_days_worked").delete().eq("user_id", user.id).eq("work_date", date);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
});
