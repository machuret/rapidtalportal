import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";
import { evaluateCoachQuality } from "@/lib/brain/coach-quality-gate";
import { coachModeSchema } from "@/lib/brain/coach-action-policy";

const sourceSchema = z.object({
  n: z.number().int().optional(),
  kind: z.string().max(30),
  kindLabel: z.string().max(100),
  title: z.string().max(300),
  itemId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  sourceUrl: z.string().url().nullable(),
  versionId: z.string().uuid().nullable(),
  versionNumber: z.number().int().nullable(),
  chunkId: z.string().uuid().nullable(),
  category: z.string().max(200).nullable(),
});

const saveSchema = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid().optional().nullable(),
  question: z.string().trim().min(3).max(8000),
  answer: z.string().trim().min(1).max(30000),
  snapshotId: z.string().uuid(),
  coachMode: coachModeSchema,
  sources: z.array(sourceSchema).max(30).default([]),
  suggestions: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  libraryAvailability: z.enum(["available", "degraded", "unavailable", "not_requested"]),
  warnings: z.array(z.object({
    code: z.string().max(100),
    message: z.string().max(1000),
    severity: z.enum(["info", "warning", "blocking"]),
  })).max(20).default([]),
  actionDraft: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("create_task"), idempotencyKey: z.string().uuid(),
      title: z.string().max(300), brief: z.string().max(10000),
      assigneeId: z.string().uuid().nullable(), priority: z.number().int().min(1).max(4),
      dueDate: z.iso.date().nullable(),
    }),
    z.object({
      type: z.literal("send_message"), idempotencyKey: z.string().uuid(),
      audience: z.enum(["client", "va_team"]), message: z.string().max(4000),
    }),
    z.object({ type: z.literal("update_task"), idempotencyKey: z.string().uuid(), taskId: z.string().uuid(), status: z.enum(["todo", "in_progress", "review", "done"]), priority: z.number().int().min(1).max(4), dueDate: z.iso.date().nullable(), note: z.string().max(2000) }),
    z.object({ type: z.literal("submit_review"), idempotencyKey: z.string().uuid(), taskId: z.string().uuid(), note: z.string().max(2000) }),
    z.object({ type: z.literal("review_task"), idempotencyKey: z.string().uuid(), taskId: z.string().uuid(), decision: z.enum(["approve", "changes"]), note: z.string().max(2000) }),
    z.object({ type: z.literal("create_goal"), idempotencyKey: z.string().uuid(), title: z.string().trim().min(1).max(300), outcome: z.string().max(4000), targetDate: z.iso.date().nullable() }),
    z.object({ type: z.literal("create_commitment"), idempotencyKey: z.string().uuid(), commitment: z.string().trim().min(1).max(1000), goalId: z.string().uuid().nullable(), dueDate: z.iso.date().nullable(), checkInDate: z.iso.date().nullable() }),
    z.object({ type: z.literal("create_memory"), idempotencyKey: z.string().uuid(), kind: z.enum(["preference", "decision", "context", "challenge"]), content: z.string().trim().min(3).max(2000) }),
  ]).nullable().default(null),
});

export const GET = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach history is unavailable while viewing as another user." }, { status: 409 });
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration follows generated schema snapshot
  const db = createAdminClient() as any;
  const { data: thread, error: threadError } = await db.from("coach_threads")
    .select("id,title,status,retention_days,created_at,updated_at")
    .eq("client_id", clientId).eq("owner_id", user.id).eq("status", "active")
    .maybeSingle();
  if (threadError) return serverError(threadError);
  if (!thread) return NextResponse.json({ thread: null, turns: [] });

  const { data: turns, error } = await db.from("coach_turns")
    .select("id,question,answer,coach_mode,brain_context_snapshot_id,sources,suggestions,library_availability,warnings,action_draft,action_status,created_at")
    .eq("thread_id", thread.id).eq("owner_id", user.id)
    .order("created_at", { ascending: false }).limit(100);
  if (error) return serverError(error);
  return NextResponse.json({ thread, turns: [...(turns ?? [])].reverse() });
});

export const POST = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach history is unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid Coach turn." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const quality = evaluateCoachQuality({
    role: user.role === "va" ? "va" : user.role === "client_admin" ? "client_admin" : "super_admin",
    answer: parsed.data.answer,
    snapshotId: parsed.data.snapshotId,
    libraryAvailability: parsed.data.libraryAvailability,
    warningCodes: parsed.data.warnings.map((warning) => warning.code),
    sources: parsed.data.sources,
    action: parsed.data.actionDraft,
    expectedClientId: parsed.data.clientId,
  });
  if (!quality.passed) {
    return NextResponse.json({
      error: "The Coach answer did not pass the required evidence and role boundary checks.",
      recoverable: true,
      qualityIssues: quality.issues.map((issue) => issue.code),
    }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration follows generated schema snapshot
  const db = createAdminClient() as any;
  const { data: snapshot, error: snapshotError } = await db.from("brain_context_snapshots")
    .select("id").eq("id", parsed.data.snapshotId).eq("client_id", parsed.data.clientId)
    .eq("created_by", user.id).maybeSingle();
  if (snapshotError) return serverError(snapshotError);
  if (!snapshot) return NextResponse.json({ error: "Verified Brain snapshot not found." }, { status: 409 });

  // The Edge function, not the browser, authors executable previews. History
  // stores that immutable original while the user may still edit the payload
  // they explicitly confirm later.
  let securedActionDraft = null;
  if (parsed.data.actionDraft) {
    const preview = await db.from("coach_action_previews")
      .select("generated_payload")
      .eq("idempotency_key", parsed.data.actionDraft.idempotencyKey)
      .eq("brain_context_snapshot_id", parsed.data.snapshotId)
      .eq("client_id", parsed.data.clientId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (preview.error) return serverError(preview.error);
    if (!preview.data) return NextResponse.json({ error: "Secured Coach preview not found." }, { status: 409 });
    securedActionDraft = preview.data.generated_payload;
  }

  let thread: { id: string } | null = null;
  if (parsed.data.threadId) {
    const result = await db.from("coach_threads").select("id")
      .eq("id", parsed.data.threadId).eq("client_id", parsed.data.clientId)
      .eq("owner_id", user.id).eq("status", "active").maybeSingle();
    if (result.error) return serverError(result.error);
    thread = result.data;
  }
  if (!thread) {
    const existing = await db.from("coach_threads").select("id")
      .eq("client_id", parsed.data.clientId).eq("owner_id", user.id).eq("status", "active").maybeSingle();
    if (existing.error) return serverError(existing.error);
    thread = existing.data;
  }
  if (!thread) {
    const created = await db.from("coach_threads").insert({
      client_id: parsed.data.clientId,
      owner_id: user.id,
      title: parsed.data.question.slice(0, 200),
    }).select("id").single();
    if (created.error) return serverError(created.error);
    thread = created.data;
  }

  const existingTurn = await db.from("coach_turns")
    .select("id,created_at")
    .eq("owner_id", user.id)
    .eq("brain_context_snapshot_id", parsed.data.snapshotId)
    .maybeSingle();
  if (existingTurn.error) return serverError(existingTurn.error);
  if (existingTurn.data) {
    return NextResponse.json({ threadId: thread!.id, turn: existingTurn.data, replayed: true });
  }

  const { data: turn, error } = await db.from("coach_turns").insert({
    thread_id: thread!.id,
    client_id: parsed.data.clientId,
    owner_id: user.id,
    question: parsed.data.question,
    answer: parsed.data.answer,
    coach_mode: parsed.data.coachMode,
    brain_context_snapshot_id: parsed.data.snapshotId,
    sources: parsed.data.sources,
    suggestions: parsed.data.suggestions,
    library_availability: parsed.data.libraryAvailability,
    warnings: parsed.data.warnings,
    action_draft: securedActionDraft,
    action_status: securedActionDraft ? "draft" : "none",
  })
    .select("id,created_at").single();
  if (error?.code === "23505") {
    const replay = await db.from("coach_turns")
      .select("id,created_at")
      .eq("owner_id", user.id)
      .eq("brain_context_snapshot_id", parsed.data.snapshotId)
      .single();
    if (replay.error) return serverError(replay.error);
    return NextResponse.json({ threadId: thread!.id, turn: replay.data, replayed: true });
  }
  if (error) return serverError(error);
  await db.from("coach_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread!.id).eq("owner_id", user.id);
  return NextResponse.json({ threadId: thread!.id, turn }, { status: 201 });
});

const archiveSchema = z.object({ clientId: z.string().uuid(), threadId: z.string().uuid() });
export const DELETE = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach history is unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid Coach thread." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration follows generated schema snapshot
  const db = createAdminClient() as any;
  const { error } = await db.from("coach_threads").update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.threadId).eq("client_id", parsed.data.clientId).eq("owner_id", user.id);
  if (error) return serverError(error);
  return NextResponse.json({ success: true });
});
