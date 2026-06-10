/**
 * Task board API (shared Trello-style board per client).
 * POST   — create a task. VAs create for themselves; admins can assign anyone in the client.
 * PATCH  — update fields / move between columns. VAs only their own cards; admins any.
 * DELETE — remove a task. Creator or admins.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const STATUSES = ["todo", "in_progress", "review", "done"] as const;

const createSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional().default(""),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUSES).optional().default("todo"),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  orderIndex: z.number().int().min(0).max(100000).optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

const SELECT = "id, client_id, assigned_to, created_by, title, description, status, order_index, due_date, created_at, updated_at";

const isAdmin = (role: string) => role === "client_admin" || role === "super_admin";

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  // VAs always own what they create; admins may assign anyone in the client.
  const assignedTo = isAdmin(user.role) ? (parsed.data.assignedTo ?? null) : user.id;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("tasks")
    .insert({
      client_id: parsed.data.clientId,
      created_by: user.id,
      assigned_to: assignedTo,
      title: parsed.data.title.trim(),
      description: parsed.data.description,
      status: parsed.data.status,
      due_date: parsed.data.dueDate ?? null,
      updated_at: new Date().toISOString(),
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
    .from("tasks")
    .select("id, client_id, assigned_to, created_by")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const task = existing as { client_id: string; assigned_to: string | null; created_by: string | null };
  const denied = assertClientAccess(user, task.client_id);
  if (denied) return denied;

  // VAs may only touch their own cards (assigned to them or created by them).
  if (!isAdmin(user.role) && task.assigned_to !== user.id && task.created_by !== user.id) {
    return NextResponse.json({ error: "You can only update your own tasks." }, { status: 403 });
  }
  // Only admins may reassign.
  if (parsed.data.assignedTo !== undefined && !isAdmin(user.role)) {
    return NextResponse.json({ error: "Only admins can reassign tasks." }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.assignedTo !== undefined) updates.assigned_to = parsed.data.assignedTo;
  if (parsed.data.dueDate !== undefined) updates.due_date = parsed.data.dueDate;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.orderIndex !== undefined) updates.order_index = parsed.data.orderIndex;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("tasks")
    .update(updates)
    .eq("id", parsed.data.id)
    .select(SELECT)
    .single();

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
    .from("tasks")
    .select("id, client_id, created_by")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const task = existing as { client_id: string; created_by: string | null };
  const denied = assertClientAccess(user, task.client_id);
  if (denied) return denied;
  if (!isAdmin(user.role) && task.created_by !== user.id) {
    return NextResponse.json({ error: "You can only delete tasks you created." }, { status: 403 });
  }

  const { error } = await admin.from("tasks").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
