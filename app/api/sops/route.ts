import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
  body:          z.string().min(1).max(100000),
  order_index:   z.number().int().optional().default(0),
  steps:         z.array(stepSchema).max(40).optional(),
  intro:         z.string().max(5000).optional(),
  prerequisites: z.array(z.string().max(500)).max(30).optional(),
});

const updateSchema = z.object({
  id:            z.string().uuid(),
  clientId:      z.string().uuid().nullable().optional(),
  title:         z.string().min(1).max(300).optional(),
  category:      z.string().max(100).optional(),
  body:          z.string().min(1).max(100000).optional(),
  steps:         z.array(stepSchema).max(40).optional(),
  intro:         z.string().max(5000).optional(),
  prerequisites: z.array(z.string().max(500)).max(30).optional(),
});

const deleteSchema = z.object({
  id:       z.string().uuid(),
  clientId: z.string().uuid().nullable().optional(),
});

const SELECT = "id, client_id, title, category, body, order_index, steps, intro, prerequisites, created_at, updated_at";

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
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

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
      body:          parsed.data.body,
      order_index:   parsed.data.order_index,
      steps:         parsed.data.steps ?? null,
      intro:         parsed.data.intro ?? null,
      prerequisites: parsed.data.prerequisites ?? null,
      updated_at:    new Date().toISOString(),
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ── PATCH: update SOP ─────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();

  // Fetch the SOP and authorise against its ACTUAL scope (never trust the body).
  const { data: existing } = await admin.from("sops").select("id, client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

  const denied = authorizeScope(user, (existing as { client_id: string | null }).client_id);
  if (denied) return denied;

  const id = parsed.data.id;
  const fields = { title: parsed.data.title, category: parsed.data.category, body: parsed.data.body };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("sops")
    .update(updates)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── DELETE: delete SOP ────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("sops").select("id, client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

  const denied = authorizeScope(user, (existing as { client_id: string | null }).client_id);
  if (denied) return denied;

  const { error } = await admin.from("sops").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
