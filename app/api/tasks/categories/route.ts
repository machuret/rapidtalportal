/**
 * Per-client task categories.
 * GET    — list the caller's client categories (any role).
 * POST   — create a category (client_admin / super_admin).
 * PATCH  — rename / recolour (client_admin / super_admin).
 * DELETE — remove a category; cards keep their data and become uncategorised.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { CATEGORY_COLOR_KEYS } from "@/lib/tasks/category-colors";
import type { Database } from "@/types/database";

const COLORS = CATEGORY_COLOR_KEYS as [string, ...string[]];

const createSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.enum(COLORS).optional().default("zinc"),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40).optional(),
  color: z.enum(COLORS).optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

const SELECT = "id, client_id, name, color, order_index, created_at";
const isAdmin = (role: string) => role === "client_admin" || role === "super_admin";

const DUP_MSG = "A category with that name already exists.";

export const GET = withAuth(async (_req, { user }) => {
  if (!user.client_id) return NextResponse.json([]);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("task_categories")
    .select(SELECT)
    .eq("client_id", user.client_id)
    .order("order_index")
    .order("name");
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Only admins can manage categories." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("task_categories")
    .insert({ client_id: parsed.data.clientId, name: parsed.data.name.trim(), color: parsed.data.color })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: DUP_MSG }, { status: 409 });
    return serverError(error);
  }
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("task_categories").select("client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Only admins can manage categories." }, { status: 403 });

  const updates: Database["public"]["Tables"]["task_categories"]["Update"] = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 422 });

  const { data, error } = await admin
    .from("task_categories").update(updates).eq("id", parsed.data.id).select(SELECT).single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: DUP_MSG }, { status: 409 });
    return serverError(error);
  }
  return NextResponse.json(data);
});

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("task_categories").select("client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Only admins can manage categories." }, { status: 403 });

  const { error } = await admin.from("task_categories").delete().eq("id", parsed.data.id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
});
