import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({ client_id: z.string().uuid() });
const feedbackSchema = z.object({
  client_id: z.string().uuid(),
  project_id: z.string().uuid(),
  piece_id: z.string().uuid().nullable().optional(),
  voice_accuracy: z.number().int().min(1).max(5),
  idea_usefulness: z.number().int().min(1).max(5),
  differentiation_quality: z.number().int().min(1).max(5),
  source_trust: z.number().int().min(1).max(5),
  workflow_ease: z.number().int().min(1).max(5),
  notes: z.string().trim().max(4000).optional().default(""),
});

type EventRow = { event_type: string; project_id: string | null };
type AttemptRow = {
  id: string;
  analysis_kind: string;
  status: string;
  provider: string | null;
  model: string | null;
  estimated_cost_usd: number | string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export const GET = withAuth(async (req, { user }) => {
  const parsed = querySchema.safeParse({
    client_id: req.nextUrl.searchParams.get("client_id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // Pilot tables precede the next generated Supabase type refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const abandonedBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    { data: client, error: clientError },
    { data: events, error: eventError },
    { data: attempts, error: attemptError },
    { data: abandoned, error: abandonedError },
    { data: feedback, error: feedbackError },
    { data: evaluations, error: evaluationError },
  ] = await Promise.all([
    db.from("clients")
      .select("content_pilot_enabled,content_pilot_started_at")
      .eq("id", parsed.data.client_id)
      .maybeSingle(),
    db.from("content_workflow_events")
      .select("event_type,project_id")
      .eq("client_id", parsed.data.client_id)
      .order("created_at", { ascending: false })
      .limit(5000),
    db.from("content_analysis_attempts")
      .select("id,analysis_kind,status,provider,model,estimated_cost_usd,error_code,error_message,started_at,completed_at")
      .eq("client_id", parsed.data.client_id)
      .order("started_at", { ascending: false })
      .limit(100),
    db.from("content_projects")
      .select("id,title,current_step,updated_at")
      .eq("client_id", parsed.data.client_id)
      .in("status", ["active", "saved"])
      .lt("updated_at", abandonedBefore)
      .order("updated_at", { ascending: true })
      .limit(100),
    db.from("content_pilot_feedback")
      .select("voice_accuracy,idea_usefulness,differentiation_quality,source_trust,workflow_ease,updated_at")
      .eq("client_id", parsed.data.client_id),
    db.from("content_voice_evaluations")
      .select("assignment,preferred_variant")
      .eq("client_id", parsed.data.client_id)
      .eq("status", "reviewed"),
  ]);
  const error = clientError ?? eventError ?? attemptError ?? abandonedError ?? feedbackError ?? evaluationError;
  if (error) return serverError(error);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const eventRows = (events ?? []) as EventRow[];
  const count = (type: string) => eventRows.filter((row) => row.event_type === type).length;
  const uniqueProjects = (type: string) =>
    new Set(eventRows.filter((row) => row.event_type === type).map((row) => row.project_id).filter(Boolean)).size;
  const attemptRows = (attempts ?? []) as AttemptRow[];
  const totals = (feedback ?? []).reduce((acc: Record<string, number>, row: Record<string, number>) => {
    for (const field of ["voice_accuracy", "idea_usefulness", "differentiation_quality", "source_trust", "workflow_ease"]) {
      acc[field] = (acc[field] ?? 0) + row[field];
    }
    return acc;
  }, {});
  const feedbackCount = (feedback ?? []).length;

  let conditionedWins = 0;
  let decidedEvaluations = 0;
  for (const row of evaluations ?? []) {
    if (!row.preferred_variant || row.preferred_variant === "tie") continue;
    const chosen = row.assignment?.[row.preferred_variant];
    if (chosen === "conditioned") conditionedWins++;
    decidedEvaluations++;
  }

  return NextResponse.json({
    enabled: client.content_pilot_enabled,
    started_at: client.content_pilot_started_at,
    workflow: {
      ideas_promoted: uniqueProjects("idea_promoted"),
      briefs_reaching_drafts: uniqueProjects("draft_generated"),
      drafts_approved: uniqueProjects("draft_approved"),
      revisions: count("draft_revised"),
      validation_failures: count("validation_failed"),
      abandoned_total: (abandoned ?? []).length,
      abandoned_by_stage: Object.fromEntries(
        Object.entries(
          (abandoned ?? []).reduce((acc: Record<string, number>, row: { current_step: string }) => {
            acc[row.current_step] = (acc[row.current_step] ?? 0) + 1;
            return acc;
          }, {}),
        ),
      ),
    },
    analysis: {
      total_cost_usd: Number(attemptRows.reduce(
        (sum, row) => sum + Number(row.estimated_cost_usd || 0),
        0,
      ).toFixed(6)),
      running: attemptRows.filter((row) => row.status === "running"),
      failures: attemptRows.filter((row) => row.status === "failed").slice(0, 20),
      recent: attemptRows.slice(0, 20),
    },
    feedback: {
      count: feedbackCount,
      averages: Object.fromEntries(
        Object.entries(totals).map(([key, value]) => [
          key,
          feedbackCount ? Number((Number(value) / feedbackCount).toFixed(2)) : null,
        ]),
      ),
    },
    voice_quality: {
      conditioned_wins: conditionedWins,
      decided_evaluations: decidedEvaluations,
      preference_rate: decidedEvaluations
        ? Number((conditionedWins / decidedEvaluations).toFixed(3))
        : null,
      threshold: 0.8,
      passing: decidedEvaluations > 0 && conditionedWins / decidedEvaluations >= 0.8,
    },
  });
});

export const POST = withAuth(async (req, { user }) => {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [{ data: client, error: clientError }, { data: project, error: projectError }] =
    await Promise.all([
      db.from("clients")
        .select("content_pilot_enabled")
        .eq("id", parsed.data.client_id)
        .maybeSingle(),
      db.from("content_projects")
        .select("id,current_piece_id")
        .eq("id", parsed.data.project_id)
        .eq("client_id", parsed.data.client_id)
        .maybeSingle(),
    ]);
  if (clientError || projectError) return serverError(clientError ?? projectError);
  if (!client?.content_pilot_enabled) {
    return NextResponse.json({ error: "This client is not in the Content Studio pilot." }, { status: 422 });
  }
  if (!project) return NextResponse.json({ error: "Content project not found." }, { status: 404 });
  if (parsed.data.piece_id && parsed.data.piece_id !== project.current_piece_id) {
    return NextResponse.json({ error: "The reviewed draft is not connected to this project." }, { status: 422 });
  }

  const { data, error } = await db.from("content_pilot_feedback").upsert({
    client_id: parsed.data.client_id,
    project_id: parsed.data.project_id,
    piece_id: parsed.data.piece_id ?? project.current_piece_id,
    reviewer_id: user.id,
    voice_accuracy: parsed.data.voice_accuracy,
    idea_usefulness: parsed.data.idea_usefulness,
    differentiation_quality: parsed.data.differentiation_quality,
    source_trust: parsed.data.source_trust,
    workflow_ease: parsed.data.workflow_ease,
    notes: parsed.data.notes || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,reviewer_id" })
    .select("id,updated_at")
    .single();
  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
});
