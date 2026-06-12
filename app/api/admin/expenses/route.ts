/**
 * Business expenses & subscriptions — RapidTal internal. Super-admin only
 * (withSuperAdmin + RLS). GET list / POST create / PATCH update / DELETE
 * (soft-archive, or ?hard).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";
import type { Database } from "@/types/database";

const CADENCES = ["one_off", "weekly", "monthly", "quarterly", "yearly"] as const;
const STATUSES = ["active", "cancelled"] as const;
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SELECT = "id, name, vendor, category, amount, currency, cadence, status, next_due_date, url, started_on, owner_id, notes, created_at, updated_at";

const base = {
  name: z.string().min(1).max(200),
  vendor: z.string().max(200).nullable().optional(),
  category: z.string().max(60).optional(),
  amount: z.number().min(0).max(1e12),
  currency: z.string().min(3).max(3),
  cadence: z.enum(CADENCES).optional().default("monthly"),
  status: z.enum(STATUSES).optional().default("active"),
  nextDueDate: YMD.nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  startedOn: YMD.nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
};
const createSchema = z.object(base);
const patchSchema = z.object({
  id: z.string().uuid(),
  ...base,
  name: base.name.optional(),
  amount: base.amount.optional(),
  currency: base.currency.optional(),
});

export const GET = withSuperAdmin(async () => {
  const admin = createAdminClient();
  const { data, error } = await admin.from("expenses").select(SELECT)
    .is("archived_at", null).order("status").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
});

export const POST = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.from("expenses").insert({
    name: d.name.trim(), vendor: d.vendor ?? null, category: d.category ?? "software",
    amount: d.amount, currency: d.currency.toUpperCase(), cadence: d.cadence, status: d.status,
    next_due_date: d.nextDueDate ?? null, url: d.url ?? null, started_on: d.startedOn ?? null,
    notes: d.notes ?? null, owner_id: user.id, created_by: user.id,
  }).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const u: Database["public"]["Tables"]["expenses"]["Update"] = { updated_at: new Date().toISOString() };
  if (d.name !== undefined) u.name = d.name.trim();
  if (d.vendor !== undefined) u.vendor = d.vendor;
  if (d.category !== undefined) u.category = d.category;
  if (d.amount !== undefined) u.amount = d.amount;
  if (d.currency !== undefined) u.currency = d.currency.toUpperCase();
  if (d.cadence !== undefined) u.cadence = d.cadence;
  if (d.status !== undefined) u.status = d.status;
  if (d.nextDueDate !== undefined) u.next_due_date = d.nextDueDate;
  if (d.url !== undefined) u.url = d.url;
  if (d.startedOn !== undefined) u.started_on = d.startedOn;
  if (d.notes !== undefined) u.notes = d.notes;

  const admin = createAdminClient();
  const { data, error } = await admin.from("expenses").update(u).eq("id", d.id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
});

export const DELETE = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = z.object({ id: z.string().uuid(), hard: z.boolean().optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { error } = parsed.data.hard
    ? await admin.from("expenses").delete().eq("id", parsed.data.id)
    : await admin.from("expenses").update({ archived_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
