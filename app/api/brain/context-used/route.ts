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
    .select("id,client_id,snapshot_hash,snapshot,created_at,artifact_kind,artifact_id")
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

  return NextResponse.json({
    id: data.id,
    hash: data.snapshot_hash,
    capturedAt: data.created_at,
    request: snapshot.request,
    companyKnowledge: {
      coverage: snapshot.knowledge.coverage,
      retrievalMethod: snapshot.knowledge.retrievalMethod,
      sources: snapshot.knowledge.sources.map((source) => ({
        itemId: source.itemId,
        title: source.title,
        excerpt: source.excerpt,
        sourceUrl: source.sourceUrl,
        selectionReason: source.selectionReason,
      })),
    },
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
