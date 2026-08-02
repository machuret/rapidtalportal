"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

export interface LearningSuggestion {
  id: string;
  piece_id: string;
  classification: string;
  proposed_outcome: string;
  dimensions: string[];
  summary: string;
  lesson_content: string;
  explanation: string;
  before_excerpt: string;
  after_excerpt: string;
  proposed_scope: Record<string, unknown>;
  confidence: number;
  status: string;
  created_at: string;
  content_pieces?: { title?: string; content_type?: string } | Array<{ title?: string; content_type?: string }> | null;
}

export const brainLearningInboxKeys = {
  all: ["brain-learning-inbox"] as const,
  byClient: (clientId: string) => [...brainLearningInboxKeys.all, clientId] as const,
};

/**
 * Read side of the Brain learning inbox (editorial lessons awaiting a human
 * decision). Approve/reject stays in BrainLearningInbox and patches this
 * query's cached list. No retries: the panel surfaces its own error/Retry
 * state, matching the previous single-attempt manual load.
 */
export function useBrainLearningInbox(clientId: string) {
  return useQuery({
    queryKey: brainLearningInboxKeys.byClient(clientId),
    queryFn: () =>
      api.get<LearningSuggestion[]>(ROUTES.brain.learningInboxForClient(clientId), { showErrorToast: false }),
    staleTime: 30 * 1000,
    retry: false,
  });
}
