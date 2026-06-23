import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logCrm } from "@/lib/crm/events";

const createSchema = z.object({
  contactId: z.string().uuid(),
  clientId:  z.string().uuid(),
  body:      z.string().min(1).max(5000),
});

const deleteSchema = z.object({
  id:       z.string().uuid(),
  clientId: z.string().uuid(),
});

// ── POST: add note to contact ─────────────────────────────────────────────────
export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  const admin = createAdminClient();

  // Verify the contact belongs to this client
  const { data: contact } = await admin
    .from("crm_contacts")
    .select("id")
    .eq("id", parsed.data.contactId)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();

  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const { data, error } = await admin
    .from("crm_notes")
    .insert({
      contact_id: parsed.data.contactId,
      client_id:  parsed.data.clientId,
      body:       parsed.data.body.trim(),
      created_by: user.id,
    })
    .select("id, body, created_at")
    .single();

  if (error) return serverError(error);
  logCrm(parsed.data.contactId, parsed.data.clientId, user.id, "added a note");
  return NextResponse.json(data, { status: 201 });
});

// ── DELETE: delete a note ─────────────────────────────────────────────────────
export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  const admin = createAdminClient();

  // Scope deletion: must match client_id + created_by (only note author or admin can delete)
  const isAdmin = user.role === "client_admin" || user.role === "super_admin";
  const baseQuery = admin
    .from("crm_notes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.clientId);

  // VAs can only delete their own notes — chain filter BEFORE awaiting.
  // Return the deleted row's contact_id so we can log the activity-trail entry.
  const { data: deleted, error } = await (isAdmin ? baseQuery : baseQuery.eq("created_by", user.id)).select("contact_id");
  if (error) return serverError(error);
  const contactId = ((deleted ?? [])[0] as { contact_id: string } | undefined)?.contact_id;
  if (contactId) logCrm(contactId, parsed.data.clientId, user.id, "deleted a note");
  return NextResponse.json({ ok: true });
});
