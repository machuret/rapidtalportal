import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["lead", "prospect", "active", "inactive", "closed"] as const;

const CONTACT_SELECT =
  "id, client_id, first_name, last_name, email, phone, company, job_title, status, source, tags, notes, archived_at, created_at, updated_at";

/** Fire-and-forget activity trail entry on a contact. */
function logCrm(contactId: string, clientId: string, userId: string, body: string): void {
  const admin = createAdminClient();
  void admin
    .from("crm_events")
    .insert({ contact_id: contactId, client_id: clientId, user_id: userId, body })
    .then(({ error }) => { if (error) console.warn("[crm activity]", error.message); });
}

const createSchema = z.object({
  clientId:   z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name:  z.string().max(100).optional().nullable(),
  email:      z.string().email().max(255).optional().nullable(),
  phone:      z.string().max(50).optional().nullable(),
  company:    z.string().max(200).optional().nullable(),
  job_title:  z.string().max(200).optional().nullable(),
  status:     z.enum(STATUSES).optional().default("lead"),
  source:     z.string().max(200).optional().nullable(),
  notes:      z.string().max(10000).optional().nullable(),
});

const updateSchema = z.object({
  id:         z.string().uuid(),
  clientId:   z.string().uuid(),
  first_name: z.string().min(1).max(100).optional(),
  last_name:  z.string().max(100).optional().nullable(),
  email:      z.string().email().max(255).optional().nullable(),
  phone:      z.string().max(50).optional().nullable(),
  company:    z.string().max(200).optional().nullable(),
  job_title:  z.string().max(200).optional().nullable(),
  status:     z.enum(STATUSES).optional(),
  source:     z.string().max(200).optional().nullable(),
  notes:      z.string().max(10000).optional().nullable(),
  archived:   z.boolean().optional(),
});

const deleteSchema = z.object({
  id:       z.string().uuid(),
  clientId: z.string().uuid(),
});

// ── POST: create contact ──────────────────────────────────────────────────────
export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_contacts")
    .insert({
      client_id:  parsed.data.clientId,
      created_by: user.id,
      first_name: parsed.data.first_name.trim(),
      last_name:  parsed.data.last_name?.trim() ?? null,
      email:      parsed.data.email?.trim() ?? null,
      phone:      parsed.data.phone?.trim() ?? null,
      company:    parsed.data.company?.trim() ?? null,
      job_title:  parsed.data.job_title?.trim() ?? null,
      status:     parsed.data.status,
      source:     parsed.data.source?.trim() ?? null,
      tags:       [],
      notes:      parsed.data.notes?.trim() ?? null,
    })
    .select(CONTACT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logCrm((data as { id: string }).id, parsed.data.clientId, user.id, "created this contact");
  return NextResponse.json(data, { status: 201 });
});

// ── PATCH: update contact ─────────────────────────────────────────────────────
export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  const admin = createAdminClient();

  // Verify the contact belongs to this client before updating
  const { data: existing } = await admin
    .from("crm_contacts")
    .select("id, status")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const prevStatus = (existing as { status: string }).status;

  const { id, clientId, archived, ...fields } = parsed.data;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) updates[k] = typeof v === "string" ? v.trim() || null : v;
  }
  // first_name must not be nullified
  if (updates.first_name === null) delete updates.first_name;
  // Archive / restore — recoverable, so any team member may do it (it's logged).
  if (archived !== undefined) updates.archived_at = archived ? new Date().toISOString() : null;

  const { data, error } = await admin
    .from("crm_contacts")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updates as any)
    .eq("id", id)
    .eq("client_id", clientId)
    .select(CONTACT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activity trail.
  if (archived !== undefined) {
    logCrm(id, clientId, user.id, archived ? "archived this contact" : "restored this contact");
  } else if (parsed.data.status && parsed.data.status !== prevStatus) {
    logCrm(id, clientId, user.id, `moved this from ${prevStatus} to ${parsed.data.status}`);
  } else {
    logCrm(id, clientId, user.id, "edited contact details");
  }

  return NextResponse.json(data);
});

// ── DELETE: delete contact ────────────────────────────────────────────────────
export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  // Permanent deletion is admin-only — VAs archive instead (recoverable).
  if (!["client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Only admins can permanently delete contacts. Archive it instead." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_contacts")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
