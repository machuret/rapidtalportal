import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSopAccess } from "@/lib/sops/sop-access";

// clientId null  → global library SOP (super_admin only)
// clientId uuid  → client SOP (client_admin for own client, or super_admin)
const stepSchema = z.object({
  title: z.string().min(1).max(300),
  detail: z.string().max(5000).optional().default(""),
  tip: z.string().max(1000).optional(),
});

const createSchema = z.object({
  clientId:      z.string().uuid().nullable().optional(),
  title:         z.string().min(1).max(300),
  category:      z.string().max(100).optional().default("General"),
  subcategory:   z.string().max(100).optional().nullable(),
  body:          z.string().min(1).max(100000),
  order_index:   z.number().int().optional().default(0),
  steps:         z.array(stepSchema).max(40).optional(),
  intro:         z.string().max(5000).optional(),
  prerequisites: z.array(z.string().max(500)).max(30).optional(),
  visibility:    z.enum(["public", "restricted"]).optional(),
  accessUserIds: z.array(z.string().uuid()).max(1000).optional(),
});

const updateSchema = z.object({
  id:            z.string().uuid(),
  clientId:      z.string().uuid().nullable().optional(),
  title:         z.string().min(1).max(300).optional(),
  category:      z.string().max(100).optional(),
  subcategory:   z.string().max(100).optional().nullable(),
  body:          z.string().min(1).max(100000).optional(),
  steps:         z.array(stepSchema).max(40).optional(),
  intro:         z.string().max(5000).optional(),
  prerequisites: z.array(z.string().max(500)).max(30).optional(),
  visibility:    z.enum(["public", "restricted"]).optional(),
  accessUserIds: z.array(z.string().uuid()).max(1000).optional(),
});

const deleteSchema = z.object({
  id:       z.string().uuid(),
  clientId: z.string().uuid().nullable().optional(),
});

const SELECT = "id, client_id, title, category, subcategory, body, order_index, steps, intro, prerequisites, version, visibility, forked_from, forked_version, created_at, updated_at";

/** Authorise a write against a SOP's scope. Returns an error response or null. */
function authorizeScope(user: ApiUser, clientId: string | null): NextResponse | null {
  if (clientId === null) {
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Only RapidTal admins can manage the global SOP library." }, { status: 403 });
    }
    return null;
  }
  if (!["client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Only admins can manage SOPs." }, { status: 403 });
  }
  return assertClientAccess(user, clientId);
}

// ── POST: create SOP ──────────────────────────────────────────────────────────
export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeScope(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("sops")
    .insert({
      client_id:   clientId,
      created_by:  user.id,
      title:         parsed.data.title.trim(),
      category:      parsed.data.category.trim() || "General",
      subcategory:   parsed.data.subcategory?.trim() || null,
      body:          parsed.data.body,
      order_index:   parsed.data.order_index,
      steps:         parsed.data.steps ?? null,
      intro:         parsed.data.intro ?? null,
      prerequisites: parsed.data.prerequisites ?? null,
      visibility:    parsed.data.visibility ?? "public",
      updated_at:    new Date().toISOString(),
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ((parsed.data.visibility ?? "public") === "restricted") {
    await syncSopAccess(admin, (data as { id: string }).id, clientId, "restricted", parsed.data.accessUserIds);
  }
  return NextResponse.json(data, { status: 201 });
});

// ── PATCH: update SOP ─────────────────────────────────────────────────────────
export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();

  // Fetch the SOP and authorise against its ACTUAL scope (never trust the body).
  const { data: existing } = await admin.from("sops").select("id, client_id, version").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

  const cur = existing as { client_id: string | null; version: number };
  const denied = authorizeScope(user, cur.client_id);
  if (denied) return denied;

  const id = parsed.data.id;
  const fields = { title: parsed.data.title, category: parsed.data.category, subcategory: parsed.data.subcategory, body: parsed.data.body };
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) updates[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if (updates.title === null) delete updates.title;
  if (updates.body === null) delete updates.body;
  // Structured fields (from the Studio editor) — explicit so they can be set.
  if (parsed.data.steps !== undefined) updates.steps = parsed.data.steps;
  if (parsed.data.intro !== undefined) updates.intro = parsed.data.intro;
  if (parsed.data.prerequisites !== undefined) updates.prerequisites = parsed.data.prerequisites;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;
  // Bump the version when the actual content changes (not just metadata edits).
  const contentChanged = parsed.data.body !== undefined || parsed.data.steps !== undefined
    || parsed.data.intro !== undefined || parsed.data.prerequisites !== undefined;
  if (contentChanged) updates.version = (cur.version ?? 1) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("sops")
    .update(updates)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync the access list when visibility was set (the studio sends visibility +
  // accessUserIds together): public clears it, restricted replaces it.
  if (parsed.data.visibility !== undefined) {
    await syncSopAccess(admin, id, cur.client_id, parsed.data.visibility, parsed.data.accessUserIds);
  }
  return NextResponse.json(data);
});

// ── DELETE: delete SOP ────────────────────────────────────────────────────────
export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("sops").select("id, client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

  const denied = authorizeScope(user, (existing as { client_id: string | null }).client_id);
  if (denied) return denied;

  // Soft delete — stamp deleted_at so the SOP leaves every list but stays
  // recoverable, and any fork's forked_from pointer survives.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("sops")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
