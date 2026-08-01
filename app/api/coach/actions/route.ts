import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";
import { notify } from "@/lib/notifications";
import { coachActionDenial } from "@/lib/brain/coach-action-policy";

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
const updateTaskAction = z.object({
  type: z.literal("update_task"), idempotencyKey: z.string().uuid(),
  taskId: z.string().uuid(), status: z.enum(["todo", "in_progress", "review", "done"]),
  priority: z.number().int().min(1).max(4), dueDate: z.iso.date().nullable(),
  note: z.string().trim().max(2000),
});
const submitReviewAction = z.object({
  type: z.literal("submit_review"), idempotencyKey: z.string().uuid(),
  taskId: z.string().uuid(), note: z.string().trim().max(2000),
});
const reviewTaskAction = z.object({
  type: z.literal("review_task"), idempotencyKey: z.string().uuid(),
  taskId: z.string().uuid(), decision: z.enum(["approve", "changes"]),
  note: z.string().trim().max(2000),
});
const createGoalAction = z.object({
  type: z.literal("create_goal"), idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(300), outcome: z.string().trim().max(4000),
  targetDate: z.iso.date().nullable(),
});
const createCommitmentAction = z.object({
  type: z.literal("create_commitment"), idempotencyKey: z.string().uuid(),
  commitment: z.string().trim().min(1).max(1000), goalId: z.string().uuid().nullable(),
  dueDate: z.iso.date().nullable(), checkInDate: z.iso.date().nullable(),
});
const createMemoryAction = z.object({
  type: z.literal("create_memory"), idempotencyKey: z.string().uuid(),
  kind: z.enum(["preference", "decision", "context", "challenge"]),
  content: z.string().trim().min(3).max(2000),
});
const schema = z.object({
  clientId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  action: z.discriminatedUnion("type", [taskAction, messageAction, updateTaskAction, submitReviewAction, reviewTaskAction, createGoalAction, createCommitmentAction, createMemoryAction]),
});

type RpcOutcome = {
  ok: boolean;
  replayed?: boolean;
  result?: Record<string, unknown>;
  errorCode?: string;
  notification?: {
    recipientIds?: string[];
    type?: string;
    title?: string;
    body?: string;
    href?: string;
  } | null;
};

const errorResponse = (code: string) => {
  if (code === "coach_action_processing") {
    return NextResponse.json({ error: "This Coach action is already being processed. You can safely retry shortly.", recoverable: true }, { status: 409 });
  }
  if (code === "coach_preview_expired") {
    return NextResponse.json({ error: "This Coach preview expired. Ask the Coach to prepare a fresh one.", recoverable: true }, { status: 409 });
  }
  if (["coach_preview_mismatch", "coach_turn_mismatch", "coach_idempotency_mismatch", "coach_replay_mismatch"].includes(code)) {
    return NextResponse.json({ error: "The action no longer matches its secured Coach preview. Please prepare it again.", recoverable: true }, { status: 409 });
  }
  if (code === "coach_assignee_invalid") {
    return NextResponse.json({ error: "The selected VA is no longer available for this company.", recoverable: true }, { status: 409 });
  }
  if (code === "coach_task_not_found") {
    return NextResponse.json({ error: "That task is no longer available.", recoverable: true }, { status: 404 });
  }
  if (code === "coach_goal_not_found") {
    return NextResponse.json({ error: "That linked goal is no longer available. Refresh your coaching plan and retry.", recoverable: true }, { status: 404 });
  }
  if (["coach_task_not_submittable", "coach_task_not_reviewable"].includes(code)) {
    return NextResponse.json({ error: "The task changed since this preview was prepared. Refresh and try again.", recoverable: true }, { status: 409 });
  }
  if (["coach_task_forbidden", "coach_role_forbidden", "coach_audience_forbidden", "coach_va_terminal_status_forbidden", "coach_owner_forbidden", "coaching_progress_forbidden"].includes(code)) {
    return NextResponse.json({ error: "You are not permitted to perform that Coach action.", recoverable: false }, { status: 403 });
  }
  return NextResponse.json({ error: "The Coach action could not be completed. No partial change was saved, and it is safe to retry.", recoverable: true }, { status: 503 });
};

export const POST = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach actions are unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid Coach action." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const action = parsed.data.action;
  const denial = coachActionDenial(user.role, action);
  if (denial === "client_create_only") return NextResponse.json({ error: "Only a Client can create and assign a Coach task." }, { status: 403 });
  if (denial === "va_submit_only") return NextResponse.json({ error: "Only a VA can submit work for review." }, { status: 403 });
  if (denial === "client_review_only") return NextResponse.json({ error: "Only a Client can review work." }, { status: 403 });
  if (denial === "va_terminal_status_forbidden") return NextResponse.json({ error: "Submit work for review before a Client can approve it." }, { status: 403 });
  if (denial === "message_audience_forbidden") return NextResponse.json({ error: "That message audience is not available to this role." }, { status: 403 });
  if (denial === "coaching_progress_forbidden") return NextResponse.json({ error: "Private coaching progress is available only to signed-in Clients and VAs." }, { status: 403 });
  if (denial) return NextResponse.json({ error: "This role cannot update tasks." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Coach RPC arrives before generated schema refresh
  const db = createAdminClient() as any;
  const { data: turn, error: turnError } = await db.from("coach_turns")
    .select("id")
    .eq("owner_id", user.id)
    .eq("client_id", parsed.data.clientId)
    .eq("brain_context_snapshot_id", parsed.data.snapshotId)
    .maybeSingle();
  if (turnError) return serverError(turnError);
  if (!turn) return NextResponse.json({ error: "Save the Coach answer before confirming its action.", recoverable: true }, { status: 409 });

  const rpcName = action.type === "create_goal" || action.type === "create_commitment"
    ? "execute_coach_progress_action"
    : action.type === "create_memory"
      ? "execute_coach_memory_action"
      : "execute_coach_action";
  const { data, error } = await db.rpc(rpcName, {
    p_idempotency_key: action.idempotencyKey,
    p_turn_id: turn.id,
    p_client_id: parsed.data.clientId,
    p_owner_id: user.id,
    p_snapshot_id: parsed.data.snapshotId,
    p_action: action,
  });
  if (error) return serverError(error);
  const outcome = data as RpcOutcome;
  if (!outcome?.ok) return errorResponse(outcome?.errorCode ?? "coach_action_failed");

  const notification = outcome.notification;
  if (!outcome.replayed && notification?.recipientIds?.length && notification.type && notification.title) {
    void notify(notification.recipientIds, {
      clientId: parsed.data.clientId,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? "",
      href: notification.href ?? "/dashboard",
    });
  }
  return NextResponse.json({ success: true, replayed: Boolean(outcome.replayed), result: outcome.result ?? {} });
});
