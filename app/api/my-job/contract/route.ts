/**
 * /api/my-job/contract — the VA's contract / pay key-terms.
 *
 * GET  → the caller's own contract, or a VA's via ?userId= (admins only).
 * PUT  → set/update a VA's terms (client_admin / super_admin only).
 *
 * Service-role reads/writes scoped in code (assertClientAccess), matching the
 * rest of the app — the va_job_contracts table is RLS-locked to service role.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ADMIN = ["client_admin", "super_admin"];

export const GET = withAuth(async (req, { user }) => {
  const targetId = req.nextUrl.searchParams.get("userId") || user.id;
  const admin = createAdminClient();

  if (targetId !== user.id) {
    if (!ADMIN.includes(user.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    const { data: target } = await admin.from("users").select("client_id").eq("id", targetId).maybeSingle();
    const denied = assertClientAccess(user, (target as { client_id: string | null } | null)?.client_id ?? "");
    if (denied) return denied;
  }

  const { data } = await admin.from("va_job_contracts").select("*").eq("user_id", targetId).maybeSingle();
  return NextResponse.json({ contract: data ?? null });
});

const putSchema = z.object({
  userId: z.string().uuid(),
  rate: z.number().nonnegative().nullable().optional(),
  currency: z.string().max(8).optional(),
  pay_period: z.enum(["hourly", "daily", "weekly", "fortnightly", "monthly"]).optional(),
  payment_method: z.string().max(200).nullable().optional(),
  payment_schedule: z.string().max(200).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  weekly_hours: z.number().nonnegative().max(168).nullable().optional(),
  notice_period: z.string().max(100).nullable().optional(),
  next_review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  annual_leave_days: z.number().int().min(0).max(366).nullable().optional(),
});

export const PUT = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the contract fields." }, { status: 422 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("client_id, role").eq("id", parsed.data.userId).maybeSingle();
  const t = target as { client_id: string | null; role: string } | null;
  if (!t) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const denied = assertClientAccess(user, t.client_id ?? "");
  if (denied) return denied;

  const { userId, ...terms } = parsed.data;
  const { data, error } = await admin
    .from("va_job_contracts")
    .upsert({ user_id: userId, client_id: t.client_id, ...terms, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contract: data });
}, { roles: ADMIN });
