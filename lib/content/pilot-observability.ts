/* eslint-disable @typescript-eslint/no-explicit-any */
import { captureError } from "@/lib/error-tracking";

export type PilotDbClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
};

export type AnalysisAttempt = {
  id: string;
  lease_token: string;
};

const MODEL_PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
};

export function estimateModelCostUsd(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = (model ? MODEL_PRICES_PER_MILLION[model] : undefined) ??
    { input: 0, output: 0 };
  return Number((
    Math.max(inputTokens, 0) * price.input / 1_000_000 +
    Math.max(outputTokens, 0) * price.output / 1_000_000
  ).toFixed(6));
}

export async function startAnalysisAttempt(
  db: PilotDbClient,
  input: {
    clientId: string;
    actorId: string;
    kind: "competitor_intelligence" | "style_analysis" | "content_generation" | "voice_evaluation";
    relatedId?: string | null;
    inputSummary?: Record<string, unknown>;
  },
): Promise<AnalysisAttempt> {
  try {
    const { error: recoveryError } = await db.rpc(
      "expire_stale_content_analysis_attempts",
      {},
    );
    if (recoveryError) throw recoveryError;
    const { data, error } = await db
      .from("content_analysis_attempts")
      .insert({
        client_id: input.clientId,
        actor_id: input.actorId,
        analysis_kind: input.kind,
        related_id: input.relatedId ?? null,
        input_summary: input.inputSummary ?? {},
      })
      .select("id,lease_token")
      .single();
    if (error || !data) throw error ?? new Error("Analysis attempt was not recorded.");
    await recordWorkflowEvent(db, {
      clientId: input.clientId,
      actorId: input.actorId,
      eventType: "analysis_started",
      stage: "discover",
      metadata: { analysisKind: input.kind, attemptId: data.id },
    });
    return data as AnalysisAttempt;
  } catch (error) {
    captureError("api", error, {
      userId: input.actorId,
      clientId: input.clientId,
      url: `/content-analysis/${input.kind}`,
    });
    throw error;
  }
}

export async function finishAnalysisAttempt(
  db: PilotDbClient,
  attempt: AnalysisAttempt | null,
  input: {
    clientId: string;
    actorId: string;
    kind: string;
    status: "succeeded" | "failed";
    relatedId?: string | null;
    provider?: string | null;
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    resultSummary?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  if (!attempt) return;
  try {
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const { error } = await db.rpc("finish_content_analysis_attempt", {
      p_attempt_id: attempt.id,
      p_lease_token: attempt.lease_token,
      p_status: input.status,
      p_related_id: input.relatedId ?? null,
      p_provider: input.provider ?? null,
      p_model: input.model ?? null,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_estimated_cost_usd: estimateModelCostUsd(input.model ?? null, inputTokens, outputTokens),
      p_result_summary: input.resultSummary ?? {},
      p_error_code: input.errorCode ?? null,
      p_error_message: input.errorMessage ?? null,
    });
    if (error) throw error;
    await recordWorkflowEvent(db, {
      clientId: input.clientId,
      actorId: input.actorId,
      eventType: input.status === "succeeded" ? "analysis_succeeded" : "analysis_failed",
      stage: "discover",
      metadata: {
        analysisKind: input.kind,
        attemptId: attempt.id,
        relatedId: input.relatedId ?? null,
        errorCode: input.errorCode ?? null,
      },
    });
  } catch (error) {
    captureError("api", error, {
      userId: input.actorId,
      clientId: input.clientId,
      url: `/content-analysis/${input.kind}/${attempt.id}`,
    });
  }
}

export async function recordWorkflowEvent(
  db: PilotDbClient,
  input: {
    clientId: string;
    projectId?: string | null;
    pieceId?: string | null;
    actorId: string;
    eventType:
      | "idea_promoted"
      | "brief_completed"
      | "draft_generated"
      | "draft_revised"
      | "draft_approved"
      | "validation_failed"
      | "analysis_started"
      | "analysis_succeeded"
      | "analysis_failed";
    stage?: "discover" | "idea" | "brief" | "evidence" | "generate" | "edit" | "validate" | "approve" | "complete";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await db.from("content_workflow_events").insert({
      client_id: input.clientId,
      project_id: input.projectId ?? null,
      piece_id: input.pieceId ?? null,
      actor_id: input.actorId,
      event_type: input.eventType,
      workflow_stage: input.stage ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) throw error;
  } catch (error) {
    captureError("api", error, {
      userId: input.actorId,
      clientId: input.clientId,
      url: `/content-workflow/${input.eventType}`,
    });
  }
}
