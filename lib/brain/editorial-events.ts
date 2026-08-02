import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyseEditorialChange,
  type EditorialAnalysis,
} from "./editorial-learning";

type Admin = SupabaseClient;

export interface EditorialSuggestion {
  id: string;
  event_id: string;
  classification: EditorialAnalysis["classification"];
  proposed_outcome: EditorialAnalysis["outcome"];
  dimensions: EditorialAnalysis["dimensions"];
  summary: string;
  lesson_content: string;
  explanation: string;
  proposed_scope: Record<string, unknown>;
  confidence: number;
  status: "pending";
}

export async function recordEditorialRevision(input: {
  admin: Admin;
  clientId: string;
  projectId?: string | null;
  pieceId: string;
  actorId: string;
  origin: "manual" | "ai_rewrite";
  beforeTitle?: string | null;
  afterTitle?: string | null;
  beforeBody: string;
  afterBody: string;
  channel: string;
  contentType?: string | null;
}): Promise<EditorialSuggestion | null> {
  const db = input.admin;
  const { data: priorRows, error: priorError } = await db
    .from("editorial_learning_suggestions")
    .select("dimensions")
    .eq("client_id", input.clientId)
    .eq("proposed_outcome", "channel_style_update")
    .contains("proposed_scope", { channels: [input.channel] })
    .order("created_at", { ascending: false })
    .limit(20);
  if (priorError) throw new Error(`Could not inspect prior editorial learning: ${priorError.message}`);

  const firstAnalysis = analyseEditorialChange({
    before: input.beforeBody,
    after: input.afterBody,
    channel: input.channel,
    contentType: input.contentType,
  });
  const priorSimilarEdits = (priorRows ?? []).filter((row: { dimensions?: string[] }) =>
    row.dimensions?.some((dimension) => firstAnalysis.dimensions.includes(dimension as never))
  ).length;
  const analysis = analyseEditorialChange({
    before: input.beforeBody,
    after: input.afterBody,
    channel: input.channel,
    contentType: input.contentType,
    priorSimilarEdits,
  });

  const { data: event, error: eventError } = await db
    .from("content_editorial_events")
    .select("id,before_body,after_body")
    .eq("client_id", input.clientId)
    .eq("piece_id", input.pieceId)
    .eq("event_type", input.origin === "manual" ? "manual_revision" : "ai_rewrite")
    .contains("analysis", { pendingAnalysis: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eventError) throw new Error(`Could not load the captured editorial revision: ${eventError.message}`);
  if (
    !event ||
    (event.before_body ?? "") !== input.beforeBody ||
    (event.after_body ?? "") !== input.afterBody
  ) {
    throw new Error("The exact editorial revision was saved, but its analysis could not be attached safely.");
  }
  const { error: analysisError } = await db
    .from("content_editorial_events")
    .update({
      analysis,
      created_by: input.actorId,
    })
    .eq("id", event.id)
    .eq("client_id", input.clientId);
  if (analysisError) throw new Error(`Could not attach editorial analysis: ${analysisError.message}`);

  // AI rewrites are retained in lineage but never interpreted as a human
  // preference. Minor and one-off edits likewise create no teaching prompt.
  if (input.origin !== "manual" || !analysis.meaningful) return null;

  const proposedScope = {
    surfaces: ["content"],
    channels: [input.channel],
    ...(input.contentType ? { contentTypes: [input.contentType] } : {}),
    global: false,
  };
  const { data: suggestion, error: suggestionError } = await db
    .from("editorial_learning_suggestions")
    .insert({
      client_id: input.clientId,
      project_id: input.projectId ?? null,
      piece_id: input.pieceId,
      event_id: event.id,
      classification: analysis.classification,
      proposed_outcome: analysis.outcome,
      dimensions: analysis.dimensions,
      summary: analysis.summary,
      lesson_content: analysis.suggestedLesson,
      explanation: analysis.explanation,
      before_excerpt: analysis.beforeExcerpt,
      after_excerpt: analysis.afterExcerpt,
      proposed_scope: proposedScope,
      confidence: analysis.confidence,
      status: "pending",
      created_by: input.actorId,
    })
    .select("id,event_id,classification,proposed_outcome,dimensions,summary,lesson_content,explanation,proposed_scope,confidence,status")
    .single();
  if (suggestionError) throw new Error(`Could not create editorial learning suggestion: ${suggestionError.message}`);
  return suggestion as EditorialSuggestion;
}
