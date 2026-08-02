"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type BrainContextUsedResponse = {
  id: string;
  hash: string;
  capturedAt: string;
  companyKnowledge: {
    coverage: "strong" | "partial" | "weak" | "none";
    sources: Array<{
      itemId: string;
      chunkId: string | null;
      title: string;
      excerpt: string;
      sourceUrl: string | null;
      selectionReason: string;
    }>;
  };
  businessLibrary: {
    availability: "available" | "degraded" | "unavailable" | "not_requested";
    coverage: "strong" | "partial" | "weak" | "none";
    retrievalMethod: string;
    sources: Array<{
      entryId: string;
      versionId: string;
      chunkId: string | null;
      versionNumber: number;
      title: string;
      excerpt: string;
      category: string;
      sourceUrl: string | null;
      selectionReason: string;
    }>;
  };
  roleBoundary: {
    coachRole: "client" | "va";
    conversationVisibility: "private_coach";
    intendedAudience: "private" | "client" | "va_team" | "task_board";
    permissions: string[];
  } | null;
  currentWork: {
    availability: "available" | "unavailable" | "not_requested";
    scope: "company" | "assigned_only" | "none";
    tasks: Array<{
      taskId: string;
      title: string;
      status: string;
      dueDate: string | null;
      assignedName: string | null;
      selectionReason: string;
    }>;
    team: Array<{ userId: string; displayName: string; role: string }>;
  };
  privateCoaching: {
    availability: "available" | "unavailable" | "not_requested";
    goals: Array<{ goalId: string; title: string; status: string; progress: number; targetDate: string | null }>;
    commitments: Array<{ commitmentId: string; commitment: string; status: string; dueDate: string | null; nextCheckInAt: string | null }>;
    memories: Array<{ memoryId: string; kind: string; content: string; updatedAt: string | null }>;
    feedback: Array<{ signalId: string; rating: 1 | -1; category: string; dimensions: string[]; createdAt: string | null }>;
  };
  companyVoice: {
    source: string;
    channel: string | null;
    confidence: number | null;
    instructions: string[];
    hardRules: Array<Record<string, unknown>>;
    fallbackReason: string | null;
  };
  learnedPreferences: Array<{
    id: string;
    kind: string;
    content: string;
    confidence: number;
    reason: string;
  }>;
  marketContext: {
    included: boolean;
    snapshotIds: string[];
    insights: Array<{ insightId: string; kind: string; summary: string; confidence: string }>;
  };
  contextualReadiness: {
    channel: string | null;
    channelReadiness: string;
    voiceConfidence: string;
    vaultCoverage: string;
    relevantLessons: number;
    marketUpdatedAt: string | null;
  };
  warnings: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "blocking";
  }>;
  recoverableWarnings: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "blocking";
  }>;
};

export const brainContextUsedKeys = {
  all: ["brain-context-used"] as const,
  bySnapshot: (clientId: string, snapshotId: string) =>
    [...brainContextUsedKeys.all, clientId, snapshotId] as const,
};

/**
 * Read side of the immutable Brain context snapshot shown by BrainContextUsed.
 * Lazy by contract: pass `enabled` from the panel's open state so the fetch
 * only fires when the section is expanded. Snapshots are immutable, so the
 * result never goes stale — refetch only happens via the panel's Retry
 * (refetch()) after a failure. No retries: the panel surfaces its own
 * error/Retry state, matching the previous single-attempt manual load.
 */
export function useBrainContextUsed(
  clientId: string,
  snapshotId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: brainContextUsedKeys.bySnapshot(clientId, snapshotId ?? ""),
    queryFn: () =>
      api.get<BrainContextUsedResponse>(
        `/api/brain/context-used?clientId=${clientId}&snapshotId=${snapshotId}`,
        { showErrorToast: false },
      ),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    enabled: enabled && !!snapshotId,
  });
}
