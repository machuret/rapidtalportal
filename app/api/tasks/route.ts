/**
 * Task board API (shared Trello-style board per client).
 * POST   — create a task. VAs create for themselves; admins can assign anyone in the client.
 * PATCH  — update fields / move between columns. VAs only their own cards; admins any.
 * DELETE — remove a task. Creator, assignee, or admins.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { notify, clientAdminIds } from "@/lib/notifications";
import type { Database } from "@/types/database";

const STATUSES = ["todo", "in_progress", "review", "done"] as const;

const createSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional().default(""),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUSES).optional().default("todo"),
  priority: z.number().int().min(1).max(4).optional().default(2),
  categoryId: z.string().uuid().nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  orderIndex: z.number().int().min(0).max(100000).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

/** A category may only be attached if it belongs to the same client. */
async function categoryOk(admin: ReturnType<typeof createAdminClient>, categoryId: string, clientId: string): Promise<boolean> {
  const { data } = await admin.from("task_categories").select("id").eq("id", categoryId).eq("client_id", clientId).maybeSingle();
  return !!data;
}

// The assignee must belong to the task's client — otherwise an admin could assign
// a task to a user UUID from another tenant, who would then pass the ownership
// check (assigned_to === user.id) and gain read/edit/delete on a foreign card
// (and receive a cross-tenant notification leaking the title/description).
async function assigneeOk(admin: ReturnType<typeof createAdminClient>, userId: string, clientId: string): Promise<boolean> {
  const { data } = await admin.from("users").select("id").eq("id", userId).eq("client_id", clientId).maybeSingle();
  return !!data;
}

const deleteSchema = z.object({ id: z.string().uuid() });

const SELECT = "id, client_id, assigned_to, created_by, title, description, status, order_index, due_date, priority, completed_at, category_id, created_at, updated_at";

const isAdmin = (role: string) => role === "client_admin" || role === "super_admin";

const STATUS_LABEL: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", review: "Review", done: "Done",
};

/** Fire-and-forget activity trail entry ("moved to Review", …). */
function logActivity(taskId: string, clientId: string, userId: string, body: string): void {
  const admin = createAdminClient();
  void admin
    .from("task_events")
    .insert({ task_id: taskId, client_id: clientId, user_id: userId, kind: "activity", body })
    .then(({ error }) => { if (error) console.warn("[task activity]", error.message); });
}

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
  if (parsed.data.categoryId && !(await categoryOk(admin, parsed.data.categoryId, parsed.data.clientId))) {
    return NextResponse.json({ error: "Unknown category." }, { status: 422 });
  }
  if (assignedTo && !(await assigneeOk(admin, assignedTo, parsed.data.clientId))) {
    return NextResponse.json({ error: "Assignee isn't a member of this client." }, { status: 422 });
  }
  const { data, error } = await admin
    .from("tasks")
    .insert({
      client_id: parsed.data.clientId,
      created_by: user.id,
      assigned_to: assignedTo,
      title: parsed.data.title.trim(),
      description: parsed.data.description,
      status: parsed.data.status,
      due_date: parsed.data.dueDate ?? null,
      priority: parsed.data.priority,
      category_id: parsed.data.categoryId ?? null,
      // A card created straight into "done" still counts as achieved.
      completed_at: parsed.data.status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .select(SELECT)
    .single();

  if (error) return serverError(error);

  logActivity((data as { id: string }).id, parsed.data.clientId, user.id, "created this task");

  // Tell the assignee they have a new card (unless they created it themselves).
  if (assignedTo && assignedTo !== user.id) {
    void notify([assignedTo], {
      clientId: parsed.data.clientId,
      type: "task_assigned",
      title: `New task: ${parsed.data.title.trim().slice(0, 120)}`,
      href: "/tasks",
      email: {
        subject: `New task assigned: ${parsed.data.title.trim().slice(0, 80)}`,
        heading: "You've been assigned a new task",
        paragraphs: [
          `"${parsed.data.title.trim()}" has been assigned to you.`,
          ...(parsed.data.description?.trim() ? [parsed.data.description.trim().slice(0, 500)] : []),
        ],
        ctaLabel: "Open the task board",
      },
    });
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
    .from("tasks")
    .select("id, client_id, assigned_to, created_by, status")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const task = existing as { client_id: string; assigned_to: string | null; created_by: string | null; status: string };
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

  const updates: Database["public"]["Tables"]["tasks"]["Update"] = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.assignedTo !== undefined) {
    if (parsed.data.assignedTo && !(await assigneeOk(admin, parsed.data.assignedTo, task.client_id))) {
      return NextResponse.json({ error: "Assignee isn't a member of this client." }, { status: 422 });
    }
    updates.assigned_to = parsed.data.assignedTo;
  }
  if (parsed.data.dueDate !== undefined) updates.due_date = parsed.data.dueDate;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.categoryId !== undefined) {
    if (parsed.data.categoryId && !(await categoryOk(admin, parsed.data.categoryId, task.client_id))) {
      return NextResponse.json({ error: "Unknown category." }, { status: 422 });
    }
    updates.category_id = parsed.data.categoryId;
  }
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    // Stamp the completion time entering "done"; clear it when leaving.
    if (parsed.data.status === "done" && task.status !== "done") updates.completed_at = new Date().toISOString();
    else if (parsed.data.status !== "done" && task.status === "done") updates.completed_at = null;
  }
  if (parsed.data.orderIndex !== undefined) updates.order_index = parsed.data.orderIndex;

  const { data, error } = await admin
    .from("tasks")
    .update(updates)
    .eq("id", parsed.data.id)
    .select(SELECT)
    .single();

  if (error) return serverError(error);

  const updated = data as { title: string; client_id: string };

  // Activity trail — answers "who moved this?"
  if (parsed.data.status !== undefined) {
    logActivity(parsed.data.id, updated.client_id, user.id, `moved this to ${STATUS_LABEL[parsed.data.status] ?? parsed.data.status}`);
  }
  if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== task.assigned_to) {
    if (parsed.data.assignedTo) {
      const { data: assignee } = await admin.from("users").select("full_name, email").eq("id", parsed.data.assignedTo).maybeSingle();
      const who = (assignee as { full_name: string | null; email: string } | null);
      logActivity(parsed.data.id, updated.client_id, user.id, `assigned this to ${who?.full_name ?? who?.email ?? "someone"}`);
    } else {
      logActivity(parsed.data.id, updated.client_id, user.id, "unassigned this task");
    }
  }
  if (parsed.data.status === undefined && parsed.data.assignedTo === undefined
      && (parsed.data.title !== undefined || parsed.data.description !== undefined || parsed.data.dueDate !== undefined)) {
    logActivity(parsed.data.id, updated.client_id, user.id, "edited this task");
  }

  // Reassigned to someone else → tell them.
  if (parsed.data.assignedTo && parsed.data.assignedTo !== task.assigned_to && parsed.data.assignedTo !== user.id) {
    void notify([parsed.data.assignedTo], {
      clientId: updated.client_id,
      type: "task_assigned",
      title: `Task assigned to you: ${updated.title.slice(0, 120)}`,
      href: "/tasks",
      email: {
        subject: `Task assigned to you: ${updated.title.slice(0, 80)}`,
        heading: "A task was assigned to you",
        paragraphs: [`"${updated.title}" has been assigned to you.`],
        ctaLabel: "Open the task board",
      },
    });
  }
  // A VA moved a card into Review → tell the client admins.
  if (parsed.data.status === "review" && !isAdmin(user.role)) {
    void clientAdminIds(updated.client_id).then((ids) =>
      notify(ids.filter((id) => id !== user.id), {
        clientId: updated.client_id,
        type: "task_review",
        title: `Ready for review: ${updated.title.slice(0, 120)}`,
        href: "/tasks",
        email: {
          subject: `Ready for your review: ${updated.title.slice(0, 80)}`,
          heading: "Work is ready for your review",
          paragraphs: [`"${updated.title}" has been marked ready for review. Approve it or request changes in the portal.`],
          ctaLabel: "Review the work",
        },
      }),
    );
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
    .from("tasks")
    .select("id, client_id, created_by, assigned_to")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const task = existing as { client_id: string; created_by: string | null; assigned_to: string | null };
  const denied = assertClientAccess(user, task.client_id);
  if (denied) return denied;
  // VAs can delete cards they own — created by them or assigned to them — which
  // matches what the board already lets them edit/move (canMove). Admins: any.
  if (!isAdmin(user.role) && task.created_by !== user.id && task.assigned_to !== user.id) {
    return NextResponse.json({ error: "You can only delete tasks you created or are assigned to." }, { status: 403 });
  }

  const { error } = await admin.from("tasks").delete().eq("id", parsed.data.id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
});
