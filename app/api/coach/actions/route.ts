import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";
import { notify } from "@/lib/notifications";

const taskAction = z.object({
  type: z.literal("create_task"),
  idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  brief: z.string().trim().min(1).max(10000),
  assigneeId: z.string().uuid().nullable(),
  priority: z.number().int().min(1).max(4),
  dueDate: z.iso.date().nullable(),
});
const messageAction = z.object({
  type: z.literal("send_message"),
  idempotencyKey: z.string().uuid(),
  audience: z.enum(["client", "va_team"]),
  message: z.string().trim().min(1).max(4000),
});
const updateTaskAction = z.object({ type: z.literal("update_task"), idempotencyKey: z.string().uuid(), taskId: z.string().uuid(), status: z.enum(["todo", "in_progress", "review", "done"]), priority: z.number().int().min(1).max(4), dueDate: z.iso.date().nullable(), note: z.string().trim().max(2000) });
const submitReviewAction = z.object({ type: z.literal("submit_review"), idempotencyKey: z.string().uuid(), taskId: z.string().uuid(), note: z.string().trim().max(2000) });
const reviewTaskAction = z.object({ type: z.literal("review_task"), idempotencyKey: z.string().uuid(), taskId: z.string().uuid(), decision: z.enum(["approve", "changes"]), note: z.string().trim().max(2000) });
const schema = z.object({
  clientId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  action: z.discriminatedUnion("type", [taskAction, messageAction, updateTaskAction, submitReviewAction, reviewTaskAction]),
});

export const POST = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach actions are unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid Coach action." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  if (parsed.data.action.type === "create_task" && user.role !== "client_admin") {
    return NextResponse.json({ error: "Only a Client can create and assign a Coach task." }, { status: 403 });
  }
  if (parsed.data.action.type === "submit_review" && user.role !== "va") return NextResponse.json({ error: "Only a VA can submit work for review." }, { status: 403 });
  if (parsed.data.action.type === "review_task" && user.role !== "client_admin") return NextResponse.json({ error: "Only a Client can review work." }, { status: 403 });
  if (parsed.data.action.type === "update_task" && !["va", "client_admin"].includes(user.role)) return NextResponse.json({ error: "This role cannot update tasks." }, { status: 403 });
  if (
    parsed.data.action.type === "send_message"
    && !(
      (user.role === "va" && parsed.data.action.audience === "client")
      || (user.role === "client_admin" && parsed.data.action.audience === "va_team")
    )
  ) {
    return NextResponse.json({ error: "That message audience is not available to this role." }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Coach tables follow the generated schema snapshot
  const db = createAdminClient() as any;
  const { data: turn, error: turnError } = await db.from("coach_turns")
    .select("id,action_draft,action_status")
    .eq("owner_id", user.id).eq("client_id", parsed.data.clientId)
    .eq("brain_context_snapshot_id", parsed.data.snapshotId).maybeSingle();
  if (turnError) return serverError(turnError);
  if (!turn) return NextResponse.json({ error: "Save the verified Coach preview before confirming it." }, { status: 409 });
  if (turn.action_draft?.idempotencyKey !== parsed.data.action.idempotencyKey || turn.action_draft?.type !== parsed.data.action.type) {
    return NextResponse.json({ error: "The action no longer matches its verified Coach preview." }, { status: 409 });
  }

  const receiptInsert = await db.from("coach_action_receipts").insert({
    idempotency_key: parsed.data.action.idempotencyKey,
    turn_id: turn.id,
    client_id: parsed.data.clientId,
    owner_id: user.id,
    action_type: parsed.data.action.type,
    payload: parsed.data.action,
    status: "processing",
  }).select("id,status,result").single();

  let receipt = receiptInsert.data as { id: string; status: string; result: Record<string, unknown> | null } | null;
  if (receiptInsert.error?.code === "23505") {
    const existing = await db.from("coach_action_receipts").select("id,status,result")
      .eq("idempotency_key", parsed.data.action.idempotencyKey).eq("owner_id", user.id).single();
    if (existing.error) return serverError(existing.error);
    receipt = existing.data;
    if (receipt?.status === "completed") return NextResponse.json({ success: true, replayed: true, result: receipt.result });
    if (receipt?.status === "processing") return NextResponse.json({ error: "This Coach action is already being processed." }, { status: 409 });
    const restarted = await db.from("coach_action_receipts").update({ status: "processing", error_code: null })
      .eq("id", receipt!.id).eq("owner_id", user.id).select("id,status,result").single();
    if (restarted.error) return serverError(restarted.error);
    receipt = restarted.data;
  } else if (receiptInsert.error) {
    return serverError(receiptInsert.error);
  }

  await db.from("coach_turns").update({ action_status: "processing" }).eq("id", turn.id).eq("owner_id", user.id);
  try {
    let result: Record<string, unknown>;
    if (parsed.data.action.type === "create_task") {
      const action = parsed.data.action;
      if (action.assigneeId) {
        const assignee = await db.from("users").select("id")
          .eq("id", action.assigneeId).eq("client_id", parsed.data.clientId).eq("role", "va").maybeSingle();
        if (assignee.error) throw assignee.error;
        if (!assignee.data) throw new Error("coach_assignee_invalid");
      }
      const created = await db.from("tasks").insert({
        client_id: parsed.data.clientId,
        created_by: user.id,
        assigned_to: action.assigneeId,
        title: action.title,
        description: action.brief,
        status: "todo",
        priority: action.priority,
        due_date: action.dueDate,
      }).select("id,title,assigned_to,status,due_date,priority").single();
      if (created.error) throw created.error;
      await db.from("task_events").insert({
        task_id: created.data.id, client_id: parsed.data.clientId, user_id: user.id,
        kind: "activity", body: "created this task with RapidTal Coach",
      });
      if (action.assigneeId) {
        void notify([action.assigneeId], {
          clientId: parsed.data.clientId,
          type: "task_assigned",
          title: `New task: ${action.title.slice(0, 120)}`,
          body: action.brief.slice(0, 200),
          href: "/tasks",
        });
      }
      result = { taskId: created.data.id, title: created.data.title };
    } else if (parsed.data.action.type === "send_message") {
      const action = parsed.data.action;
      const [recipients, sender] = await Promise.all([
        db.from("users").select("id")
          .eq("client_id", parsed.data.clientId)
          .eq("role", action.audience === "client" ? "client_admin" : "va")
          .neq("id", user.id),
        db.from("users").select("full_name,email").eq("id", user.id).single(),
      ]);
      if (recipients.error) throw recipients.error;
      if (sender.error) throw sender.error;
      const senderName = sender.data.full_name || sender.data.email;
      const created = await db.from("messages").insert({
        client_id: parsed.data.clientId,
        sender_id: user.id,
        sender_name: senderName,
        sender_role: user.role,
        body: action.message,
        audience: action.audience,
        read_by: [user.id],
      }).select("id,audience").single();
      if (created.error) throw created.error;
      const recipientIds = (recipients.data ?? []).map((recipient: { id: string }) => recipient.id);
      if (recipientIds.length) {
        void notify(recipientIds, {
          clientId: parsed.data.clientId,
          type: "message",
          title: `New message from ${senderName}`,
          body: action.message.slice(0, 200),
          href: "/messages",
        });
      }
      result = { messageId: created.data.id, audience: created.data.audience };
    } else {
      const action = parsed.data.action;
      const taskResult = await db.from("tasks").select("id,client_id,assigned_to,title,status")
        .eq("id", action.taskId).eq("client_id", parsed.data.clientId).maybeSingle();
      if (taskResult.error) throw taskResult.error;
      if (!taskResult.data) throw new Error("coach_task_not_found");
      const task = taskResult.data as { id: string; assigned_to: string | null; title: string; status: string };
      if (user.role === "va" && task.assigned_to !== user.id) throw new Error("coach_task_forbidden");
      const now = new Date().toISOString();
      let updates: Record<string, unknown>;
      let activity: string;
      if (action.type === "update_task") {
        updates = { status: action.status, priority: action.priority, due_date: action.dueDate, updated_at: now, ...(action.status === "done" ? { completed_at: now } : { completed_at: null }) };
        activity = `updated this task with RapidTal Coach (status: ${action.status})`;
      } else if (action.type === "submit_review") {
        if (!["todo", "in_progress"].includes(task.status)) throw new Error("coach_task_not_submittable");
        updates = { status: "review", updated_at: now };
        activity = "submitted this task for review with RapidTal Coach";
      } else {
        if (task.status !== "review") throw new Error("coach_task_not_reviewable");
        updates = action.decision === "approve"
          ? { status: "done", completed_at: now, updated_at: now }
          : { status: "in_progress", completed_at: null, updated_at: now };
        activity = action.decision === "approve" ? "approved this task with RapidTal Coach" : "requested changes with RapidTal Coach";
      }
      const updated = await db.from("tasks").update(updates).eq("id", task.id).eq("client_id", parsed.data.clientId).select("id,status").single();
      if (updated.error) throw updated.error;
      const events = [{ task_id: task.id, client_id: parsed.data.clientId, user_id: user.id, kind: "activity", body: activity }];
      if (action.note) events.push({ task_id: task.id, client_id: parsed.data.clientId, user_id: user.id, kind: "comment", body: action.note });
      await db.from("task_events").insert(events);
      if (action.type === "submit_review") {
        const clients = await db.from("users").select("id").eq("client_id", parsed.data.clientId).eq("role", "client_admin");
        void notify((clients.data ?? []).map((row: { id: string }) => row.id), { clientId: parsed.data.clientId, type: "task_review", title: `Ready for review: ${task.title.slice(0, 120)}`, body: action.note.slice(0, 200), href: "/tasks" });
      } else if (action.type === "review_task" && task.assigned_to) {
        void notify([task.assigned_to], { clientId: parsed.data.clientId, type: action.decision === "approve" ? "task_approved" : "task_changes", title: action.decision === "approve" ? `Approved: ${task.title.slice(0, 110)}` : `Changes requested: ${task.title.slice(0, 100)}`, body: action.note.slice(0, 200), href: "/tasks" });
      }
      result = { taskId: task.id, status: updated.data.status };
    }

    const completedAt = new Date().toISOString();
    await db.from("coach_action_receipts").update({ status: "completed", result, completed_at: completedAt })
      .eq("id", receipt!.id).eq("owner_id", user.id);
    await db.from("coach_turns").update({ action_status: "completed", action_completed_at: completedAt })
      .eq("id", turn.id).eq("owner_id", user.id);
    return NextResponse.json({ success: true, replayed: false, result });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "coach_action_failed";
    await db.from("coach_action_receipts").update({ status: "failed", error_code: code })
      .eq("id", receipt!.id).eq("owner_id", user.id);
    await db.from("coach_turns").update({ action_status: "failed" }).eq("id", turn.id).eq("owner_id", user.id);
    if (code === "coach_assignee_invalid") return NextResponse.json({ error: "The selected VA is no longer available for this company." }, { status: 409 });
    return NextResponse.json({ error: "The Coach action could not be completed. It is safe to retry." }, { status: 500 });
  }
});
