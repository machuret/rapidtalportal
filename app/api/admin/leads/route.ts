/**
 * Sales leads — RapidTal internal CRM. Super-admin only (clients/VAs have no
 * access, enforced by withSuperAdmin AND RLS).
 * GET    — list active leads (newest within stage).
 * POST   — create a lead; logs a 'note' if seeded.
 * PATCH  — update fields; a stage change is logged to the timeline.
 * DELETE — archive (soft) or hard-delete with ?hard=1.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";
import type { Database } from "@/types/database";

const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
const SELECT = "id, name, company, contact_name, email, phone, source, stage, value, owner_id, next_action, next_action_date, notes, sort_order, created_at, updated_at";

const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost",
};

const createSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  source: z.string().max(120).nullable().optional(),
  stage: z.enum(STAGES).optional().default("new"),
  value: z.number().min(0).max(1e12).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  nextAction: z.string().max(300).nullable().optional(),
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  company: z.string().max(200).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  source: z.string().max(120).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  value: z.number().min(0).max(1e12).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  nextAction: z.string().max(300).nullable().optional(),
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1e6).optional(),
});

// Safety cap on the unbounded list — the board renders every lead client-side,
// so this isn't pagination (which would need server-side search/filter), just a
// guard so a runaway dataset can't OOM the page. Revisit with real pagination
// if a pipeline ever approaches this.
const LIST_CAP = 2000;

export const GET = withSuperAdmin(async () => {
  const admin = createAdminClient();
  const { data, error } = await admin.from("leads").select(SELECT)
    .is("archived_at", null).order("stage").order("sort_order").order("created_at", { ascending: false })
    .limit(LIST_CAP);
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
});

export const POST = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.from("leads").insert({
    name: d.name.trim(), company: d.company ?? null, contact_name: d.contactName ?? null,
    email: d.email ?? null, phone: d.phone ?? null, source: d.source ?? null, stage: d.stage,
    value: d.value ?? null, owner_id: d.ownerId ?? user.id, next_action: d.nextAction ?? null,
    next_action_date: d.nextActionDate ?? null, notes: d.notes ?? null, created_by: user.id,
  }).select(SELECT).single();
  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("leads").select("stage").eq("id", d.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const prevStage = (existing as { stage: string }).stage;

  const u: Database["public"]["Tables"]["leads"]["Update"] = { updated_at: new Date().toISOString() };
  if (d.name !== undefined) u.name = d.name.trim();
  if (d.company !== undefined) u.company = d.company;
  if (d.contactName !== undefined) u.contact_name = d.contactName;
  if (d.email !== undefined) u.email = d.email;
  if (d.phone !== undefined) u.phone = d.phone;
  if (d.source !== undefined) u.source = d.source;
  if (d.stage !== undefined) u.stage = d.stage;
  if (d.value !== undefined) u.value = d.value;
  if (d.ownerId !== undefined) u.owner_id = d.ownerId;
  if (d.nextAction !== undefined) u.next_action = d.nextAction;
  if (d.nextActionDate !== undefined) u.next_action_date = d.nextActionDate;
  if (d.notes !== undefined) u.notes = d.notes;
  if (d.sortOrder !== undefined) u.sort_order = d.sortOrder;

  const { data, error } = await admin.from("leads").update(u).eq("id", d.id).select(SELECT).single();
  if (error) return serverError(error);

  if (d.stage && d.stage !== prevStage) {
    void admin.from("lead_events").insert({
      lead_id: d.id, user_id: user.id, kind: "stage",
      body: `moved from ${STAGE_LABEL[prevStage] ?? prevStage} to ${STAGE_LABEL[d.stage] ?? d.stage}`,
    });
  }
  return NextResponse.json(data);
});

export const DELETE = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = z.object({ id: z.string().uuid(), hard: z.boolean().optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { error } = parsed.data.hard
    ? await admin.from("leads").delete().eq("id", parsed.data.id)
    : await admin.from("leads").update({ archived_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
});
