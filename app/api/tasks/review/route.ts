/**
 * Client sign-off on work a VA has marked "review".
 * POST { id, decision: 'approve' | 'changes', note? }
 *   - approve  → task → done (completed_at stamped); VA notified.
 *   - changes  → task → in_progress; the note is posted as a comment; VA notified.
 *
 * Closes the dead-end: a VA moving a card to Review already pings the client
 * (task_review), but the client had no action to take. This is that action.
 * Client-admin / super-admin only, scoped to their own client.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { notify } from "@/lib/notifications";

const schema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "changes"]),
  note: z.string().max(2000).optional(),
});

const SELECT = "id, client_id, assigned_to, created_by, title, description, status, order_index, due_date, priority, completed_at, category_id, created_at, updated_at";

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("tasks").select("id, client_id, assigned_to, title, status").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const task = existing as { client_id: string; assigned_to: string | null; title: string; status: string };
  const denied = assertClientAccess(user, task.client_id);
  if (denied) return denied;

  if (task.status !== "review") {
    return NextResponse.json({ error: "This task isn't awaiting review." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const approve = parsed.data.decision === "approve";

  const { data, error } = await admin
    .from("tasks")
    .update(approve
      ? { status: "done", completed_at: now, updated_at: now }
      : { status: "in_progress", completed_at: null, updated_at: now })
    .eq("id", parsed.data.id)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activity trail + optional note as a comment (so it shows in the card thread).
  const events: { task_id: string; client_id: string; user_id: string; kind: "comment" | "activity"; body: string }[] = [
    { task_id: parsed.data.id, client_id: task.client_id, user_id: user.id, kind: "activity",
      body: approve ? "approved this task" : "requested changes" },
  ];
  if (parsed.data.note?.trim()) {
    events.push({ task_id: parsed.data.id, client_id: task.client_id, user_id: user.id, kind: "comment", body: parsed.data.note.trim() });
  }
  void admin.from("task_events").insert(events);

  // Tell the VA the outcome.
  if (task.assigned_to && task.assigned_to !== user.id) {
    void notify([task.assigned_to], {
      clientId: task.client_id,
      type: approve ? "task_approved" : "task_changes",
      title: approve ? `Approved: ${task.title.slice(0, 110)}` : `Changes requested: ${task.title.slice(0, 100)}`,
      body: parsed.data.note?.trim()?.slice(0, 200),
      href: "/tasks",
      email: {
        subject: approve ? `Approved: ${task.title.slice(0, 80)}` : `Changes requested: ${task.title.slice(0, 70)}`,
        heading: approve ? "Your work was approved" : "Changes were requested",
        paragraphs: [
          approve ? `"${task.title}" was approved. Nice work!` : `"${task.title}" was sent back for changes.`,
          ...(parsed.data.note?.trim() ? [`Note: ${parsed.data.note.trim().slice(0, 500)}`] : []),
        ],
        ctaLabel: "Open the task board",
      },
    });
  }

  return NextResponse.json(data);
});
