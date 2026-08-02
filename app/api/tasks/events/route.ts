/**
 * Task card trail.
 * GET  ?taskId — comments + activity for a card, oldest first, with names.
 * POST — add a comment; notifies the card's assignee and creator.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { notify } from "@/lib/notifications";

const postSchema = z.object({ taskId: z.string().uuid(), body: z.string().min(1).max(5000) });

async function loadTask(taskId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tasks")
    .select("id, client_id, title, assigned_to, created_by")
    .eq("id", taskId)
    .maybeSingle();
  return data as { id: string; client_id: string; title: string; assigned_to: string | null; created_by: string | null } | null;
}

export const GET = withAuth(async (req, { user }) => {
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "Missing taskId." }, { status: 400 });

  const task = await loadTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const denied = assertClientAccess(user, task.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: events, error } = await admin
    .from("task_events")
    .select("id, user_id, kind, body, created_at")
    .eq("task_id", taskId)
    .order("created_at")
    .limit(200);
  if (error) return serverError(error);

  const rows = (events ?? []) as { id: string; user_id: string | null; kind: string; body: string; created_at: string }[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: people } = await admin.from("users").select("id, full_name, email").in("id", userIds);
    for (const p of (people ?? []) as { id: string; full_name: string | null; email: string }[]) {
      names.set(p.id, p.full_name ?? p.email);
    }
  }

  return NextResponse.json({
    events: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      who: r.user_id ? (names.get(r.user_id) ?? "Removed user") : "System",
      mine: r.user_id === user.id,
      created_at: r.created_at,
    })),
  });
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Comment must be 1-5000 characters." }, { status: 422 });

  const task = await loadTask(parsed.data.taskId);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const denied = assertClientAccess(user, task.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("task_events")
    .insert({
      task_id: task.id,
      client_id: task.client_id,
      user_id: user.id,
      kind: "comment",
      body: parsed.data.body.trim(),
    })
    .select("id, kind, body, created_at")
    .single();
  if (error) return serverError(error);

  // Tell the people on the card (not yourself).
  void notify(
    [task.assigned_to, task.created_by].filter((id): id is string => !!id && id !== user.id),
    {
      clientId: task.client_id,
      type: "task_comment",
      title: `New comment on: ${task.title.slice(0, 120)}`,
      body: parsed.data.body.slice(0, 200),
      href: `/tasks?card=${task.id}`,
    },
  );

  return NextResponse.json({ event: data }, { status: 201 });
});
