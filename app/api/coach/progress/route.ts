import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";

const clientSchema = z.string().uuid();
const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("goal"), clientId: clientSchema,
    title: z.string().trim().min(1).max(300), outcome: z.string().trim().max(4000).default(""),
    targetDate: z.iso.date().nullable().default(null), sourceTurnId: z.string().uuid().nullable().default(null),
  }),
  z.object({
    kind: z.literal("commitment"), clientId: clientSchema,
    commitment: z.string().trim().min(1).max(1000), goalId: z.string().uuid().nullable().default(null),
    dueDate: z.iso.date().nullable().default(null), checkInDate: z.iso.date().nullable().default(null),
    sourceTurnId: z.string().uuid().nullable().default(null),
  }),
]);
const updateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("goal"), clientId: clientSchema, id: z.string().uuid(),
    status: z.enum(["active", "paused", "achieved", "abandoned"]),
    progress: z.number().int().min(0).max(100), targetDate: z.iso.date().nullable(),
  }),
  z.object({
    kind: z.literal("commitment"), clientId: clientSchema, id: z.string().uuid(),
    status: z.enum(["open", "completed", "snoozed", "dismissed"]),
    dueDate: z.iso.date().nullable(), checkInDate: z.iso.date().nullable(),
  }),
]);

function progressError(error: { message?: string }) {
  const message = error.message ?? "";
  if (/coach_(goal|commitment)_not_found/.test(message)) {
    return NextResponse.json({ error: "That coaching item is no longer available. Refresh your plan and retry.", recoverable: true }, { status: 404 });
  }
  if (/coach_turn_mismatch/.test(message)) {
    return NextResponse.json({ error: "The originating Coach turn no longer matches. Create the item from the current conversation.", recoverable: true }, { status: 409 });
  }
  if (/coach_owner_forbidden/.test(message)) {
    return NextResponse.json({ error: "You cannot change another person’s private coaching plan.", recoverable: false }, { status: 403 });
  }
  if (/coach_(goal|commitment)_invalid/.test(message)) {
    return NextResponse.json({ error: "That coaching update is invalid.", recoverable: true }, { status: 422 });
  }
  return serverError(error);
}

export const GET = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach progress is unavailable while viewing as another user." }, { status: 409 });
  const parsedClient = clientSchema.safeParse(req.nextUrl.searchParams.get("clientId"));
  if (!parsedClient.success) return NextResponse.json({ error: "Invalid clientId." }, { status: 400 });
  const denied = assertClientAccess(user, parsedClient.data);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 138 precedes generated schema refresh
  const db = createAdminClient() as any;
  const [goals, commitments] = await Promise.all([
    db.from("coach_goals").select("id,title,outcome,status,progress,target_date,achieved_at,updated_at")
      .eq("client_id", parsedClient.data).eq("owner_id", user.id)
      .neq("status", "abandoned").order("updated_at", { ascending: false }).limit(100),
    db.from("coach_commitments").select("id,goal_id,commitment,status,due_date,next_check_in_at,last_check_in_at,reminder_count,completed_at,updated_at")
      .eq("client_id", parsedClient.data).eq("owner_id", user.id)
      .neq("status", "dismissed").order("updated_at", { ascending: false }).limit(200),
  ]);
  if (goals.error) return serverError(goals.error);
  if (commitments.error) return serverError(commitments.error);
  return NextResponse.json({ goals: goals.data ?? [], commitments: commitments.data ?? [] });
});

export const POST = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach progress is unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid coaching item." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 138 precedes generated schema refresh
  const db = createAdminClient() as any;
  const result = parsed.data.kind === "goal"
    ? await db.rpc("create_coach_goal", {
      p_client_id: parsed.data.clientId, p_owner_id: user.id, p_title: parsed.data.title,
      p_outcome: parsed.data.outcome, p_target_date: parsed.data.targetDate,
      p_source_turn_id: parsed.data.sourceTurnId,
    })
    : await db.rpc("create_coach_commitment", {
      p_client_id: parsed.data.clientId, p_owner_id: user.id,
      p_commitment: parsed.data.commitment, p_goal_id: parsed.data.goalId,
      p_due_date: parsed.data.dueDate, p_check_in_date: parsed.data.checkInDate,
      p_source_turn_id: parsed.data.sourceTurnId,
    });
  if (result.error) return progressError(result.error);
  return NextResponse.json({ item: result.data }, { status: 201 });
});

export const PATCH = withAuth(async (req, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach progress is unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid coaching update." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 138 precedes generated schema refresh
  const db = createAdminClient() as any;
  const result = parsed.data.kind === "goal"
    ? await db.rpc("update_coach_goal", {
      p_client_id: parsed.data.clientId, p_owner_id: user.id, p_goal_id: parsed.data.id,
      p_status: parsed.data.status, p_progress: parsed.data.progress,
      p_target_date: parsed.data.targetDate,
    })
    : await db.rpc("update_coach_commitment", {
      p_client_id: parsed.data.clientId, p_owner_id: user.id, p_commitment_id: parsed.data.id,
      p_status: parsed.data.status, p_due_date: parsed.data.dueDate,
      p_check_in_date: parsed.data.checkInDate,
    });
  if (result.error) return progressError(result.error);
  return NextResponse.json({ item: result.data });
});
