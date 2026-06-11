/**
 * /api/my-job/self-report — monthly "what I delivered" record (the paper trail
 * for performance audits).
 * GET            → the caller's reports (newest first).
 * PUT {report_month, …} → create/update the report for a month (upsert).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const admin = createAdminClient();
  const { data } = await admin.from("va_self_reports").select("*").eq("user_id", user.id).order("report_month", { ascending: false });
  return NextResponse.json({ reports: data ?? [] });
});

const putSchema = z.object({
  report_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  delivered: z.string().max(5000).nullable().optional(),
  challenges: z.string().max(5000).nullable().optional(),
  goals: z.string().max(5000).nullable().optional(),
});

export const PUT = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pick the month." }, { status: 422 });

  // Normalise to the first of the month so the per-month upsert is stable.
  const report_month = `${parsed.data.report_month.slice(0, 7)}-01`;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("va_self_reports")
    .upsert({
      user_id: user.id, client_id: user.client_id, report_month,
      delivered: parsed.data.delivered ?? null,
      challenges: parsed.data.challenges ?? null,
      goals: parsed.data.goals ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,report_month" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data });
});
