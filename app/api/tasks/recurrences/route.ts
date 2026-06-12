/**
 * Recurring-task blueprints (admin-managed).
 * GET    — list the caller's client recurrences.
 * POST   — create one; the first card spawns on `startOn` (default tomorrow).
 * PATCH  — toggle active / edit fields.
 * DELETE — remove a recurrence (already-spawned cards are untouched).
 *
 * The cron at /api/cron/tasks turns these into real cards.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { FREQUENCIES } from "@/lib/tasks/recurrence";
import type { Database } from "@/types/database";

const FREQ = FREQUENCIES as [string, ...string[]];
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional().default(""),
  assignedTo: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(1).max(4).optional().default(2),
  frequency: z.enum(FREQ),
  interval: z.number().int().min(1).max(52).optional().default(1),
  startOn: YMD.optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  frequency: z.enum(FREQ).optional(),
  interval: z.number().int().min(1).max(52).optional(),
  nextRunOn: YMD.optional(),
  active: z.boolean().optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

const SELECT = "id, client_id, created_by, assigned_to, category_id, title, description, priority, frequency, interval, next_run_on, last_spawned_at, active, created_at";
const isAdmin = (role: string) => role === "client_admin" || role === "super_admin";

/** Tomorrow (UTC) as YYYY-MM-DD — a sane default first run. */
function tomorrowYMD(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const GET = withAuth(async (_req, { user }) => {
  if (!user.client_id) return NextResponse.json([]);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("task_recurrences").select(SELECT)
    .eq("client_id", user.client_id)
    .order("active", { ascending: false }).order("next_run_on");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Only admins can manage recurring tasks." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("task_recurrences")
    .insert({
      client_id: parsed.data.clientId,
      created_by: user.id,
      assigned_to: parsed.data.assignedTo ?? null,
      category_id: parsed.data.categoryId ?? null,
      title: parsed.data.title.trim(),
      description: parsed.data.description,
      priority: parsed.data.priority,
      frequency: parsed.data.frequency,
      interval: parsed.data.interval,
      next_run_on: parsed.data.startOn ?? tomorrowYMD(),
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("task_recurrences").select("client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Recurrence not found." }, { status: 404 });

  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Only admins can manage recurring tasks." }, { status: 403 });

  const u: Database["public"]["Tables"]["task_recurrences"]["Update"] = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) u.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) u.description = parsed.data.description;
  if (parsed.data.assignedTo !== undefined) u.assigned_to = parsed.data.assignedTo;
  if (parsed.data.categoryId !== undefined) u.category_id = parsed.data.categoryId;
  if (parsed.data.priority !== undefined) u.priority = parsed.data.priority;
  if (parsed.data.frequency !== undefined) u.frequency = parsed.data.frequency;
  if (parsed.data.interval !== undefined) u.interval = parsed.data.interval;
  if (parsed.data.nextRunOn !== undefined) u.next_run_on = parsed.data.nextRunOn;
  if (parsed.data.active !== undefined) u.active = parsed.data.active;

  const { data, error } = await admin
    .from("task_recurrences").update(u).eq("id", parsed.data.id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
});

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("task_recurrences").select("client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Recurrence not found." }, { status: 404 });

  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Only admins can manage recurring tasks." }, { status: 403 });

  const { error } = await admin.from("task_recurrences").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
