import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { brainContextSchema } from "@/lib/brain/context-contract";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  clientId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});

/**
 * Context snapshots retain every exact chunk for audit and reproducibility.
 * The read model groups those chunks by their immutable source identity so the
 * user sees one useful evidence card per source instead of a wall of excerpts.
 */
function groupDisplaySources<T>(
  sources: T[],
  identity: (source: T) => string,
): Array<T & { matchingExcerptCount: number }> {
  const grouped = new Map<string, T & { matchingExcerptCount: number }>();
  for (const source of sources) {
    const key = identity(source);
    const current = grouped.get(key);
    if (current) {
      current.matchingExcerptCount += 1;
    } else {
      grouped.set(key, { ...source, matchingExcerptCount: 1 });
    }
  }
  return [...grouped.values()];
}

export const GET = withAuth(async (req, { user }) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Brain context request." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brain_context_snapshots")
    .select("id,client_id,snapshot_hash,snapshot,created_at,artifact_kind,artifact_id,created_by")
    .eq("id", parsed.data.snapshotId)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) {
    return NextResponse.json({ error: "Brain context snapshot not found." }, { status: 404 });
  }

  const context = brainContextSchema.safeParse(data.snapshot);
  if (!context.success) {
    return NextResponse.json(
      { error: "This output uses an older Brain context that cannot be displayed." },
      { status: 409 },
    );
  }
  const snapshot = context.data;
  if (
    snapshot.request.actor?.conversationVisibility === "private_coach"
    && data.created_by !== user.id
  ) {
    return NextResponse.json({ error: "Private Coach context belongs to another user." }, { status: 403 });
  }

  let coachAction: {
    type: string;
    status: string;
    result: Record<string, unknown> | null;
    completedAt: string | null;
  } | null = null;
  if (snapshot.request.actor?.conversationVisibility === "private_coach") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Coach tables follow the generated schema snapshot
    const db = admin as any;
    const turnResult = await db.from("coach_turns")
      .select("id,action_status,action_draft")
      .eq("client_id", parsed.data.clientId)
      .eq("owner_id", user.id)
      .eq("brain_context_snapshot_id", parsed.data.snapshotId)
      .maybeSingle();
    if (turnResult.error) return serverError(turnResult.error);
    if (turnResult.data?.id) {
      const receiptResult = await db.from("coach_action_receipts")
        .select("action_type,status,result,completed_at")
        .eq("turn_id", turnResult.data.id)
        .eq("owner_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (receiptResult.error) return serverError(receiptResult.error);
      const draftType = turnResult.data.action_draft && typeof turnResult.data.action_draft === "object"
        ? String(turnResult.data.action_draft.type ?? "coach_action")
        : null;
      if (receiptResult.data || draftType) {
        coachAction = {
          type: receiptResult.data?.action_type ?? draftType ?? "coach_action",
          status: receiptResult.data?.status ?? turnResult.data.action_status ?? "draft",
          result: receiptResult.data?.result && typeof receiptResult.data.result === "object"
            ? receiptResult.data.result as Record<string, unknown>
            : null,
          completedAt: receiptResult.data?.completed_at ?? null,
        };
      }
    }
  }

  return NextResponse.json({
    id: data.id,
    hash: data.snapshot_hash,
    capturedAt: data.created_at,
    request: snapshot.request,
    companyKnowledge: {
      coverage: snapshot.knowledge.coverage,
      retrievalMethod: snapshot.knowledge.retrievalMethod,
      sources: groupDisplaySources(snapshot.knowledge.sources.map((source) => ({
        itemId: source.itemId,
        chunkId: source.chunkId,
        title: source.title,
        excerpt: source.excerpt,
        sourceUrl: source.sourceUrl,
        selectionReason: source.selectionReason,
      })), (source) => source.itemId),
    },
    businessLibrary: {
      availability: snapshot.library.availability,
      coverage: snapshot.library.coverage,
      retrievalMethod: snapshot.library.retrievalMethod,
      sources: groupDisplaySources(snapshot.library.sources.map((source) => ({
        entryId: source.entryId,
        versionId: source.versionId,
        chunkId: source.chunkId,
        versionNumber: source.versionNumber,
        title: source.title,
        excerpt: source.excerpt,
        category: source.category,
        sourceUrl: source.sourceUrl,
        selectionReason: source.selectionReason,
      })), (source) => source.versionId),
    },
    roleBoundary: snapshot.request.actor ? {
      coachRole: snapshot.request.actor.coachRole,
      conversationVisibility: snapshot.request.actor.conversationVisibility,
      intendedAudience: snapshot.request.actor.intendedAudience,
      permissions: snapshot.request.actor.permissions,
    } : null,
    coachAction,
    currentWork: snapshot.operations ?? {
      availability: "not_requested",
      scope: "none",
      tasks: [],
      team: [],
    },
    privateCoaching: snapshot.coaching,
    companyVoice: {
      source: snapshot.style.source,
      channel: snapshot.style.channel,
      confidence: snapshot.style.confidence,
      profileId: snapshot.style.profileId,
      instructions: snapshot.style.resolvedInstructions,
      hardRules: snapshot.style.hardRules,
      fallbackReason: snapshot.style.fallbackReason ?? null,
    },
    learnedPreferences: snapshot.memories.map((memory) => ({
      id: memory.memoryId,
      kind: memory.kind,
      content: memory.content,
      pinned: memory.pinned,
      confidence: memory.confidence,
      relevance: memory.relevance,
      reason: memory.selectionReason,
      scope: memory.scope,
    })),
    marketContext: {
      included: snapshot.market.included,
      snapshotIds: snapshot.market.snapshotIds,
      insights: snapshot.market.insights,
    },
    warnings: snapshot.warnings,
    recoverableWarnings: snapshot.warnings.filter((warning) =>
      warning.code === "business_library_unavailable" ||
      warning.code === "business_library_search_degraded" ||
      warning.code === "semantic_retrieval_unavailable" ||
      warning.code === "operational_context_unavailable" ||
      warning.code === "coach_progress_unavailable"
    ),
    contextualReadiness: {
      channel: snapshot.request.channel ?? null,
      channelReadiness:
        snapshot.style.confidence !== null && snapshot.style.confidence >= 75
          ? "strong"
          : snapshot.style.source === "generic_fallback" ? "limited" : "developing",
      voiceConfidence:
        snapshot.style.confidence === null
          ? snapshot.style.source === "generic_fallback" ? "not_configured" : "low"
          : snapshot.style.confidence >= 75 ? "high"
            : snapshot.style.confidence >= 50 ? "medium" : "low",
      vaultCoverage: snapshot.knowledge.coverage,
      relevantLessons: snapshot.memories.length,
      marketUpdatedAt: snapshot.market.included ? snapshot.provenance.generatedAt : null,
    },
  });
});
