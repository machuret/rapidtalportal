"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

export type CoachMemory = {
  id: string; kind: "preference" | "decision" | "context" | "challenge";
  content: string; status: "active" | "muted"; updated_at: string;
};

export const coachMemoryKeys = {
  all: ["coach-memories"] as const,
  byClient: (clientId: string) => [...coachMemoryKeys.all, clientId] as const,
};

/**
 * Read side of the private Coach memory list for CoachMemoryPanel. Mutations
 * stay in the panel; they and the "coach-memory-changed" window event
 * invalidate this key. No retries: the panel surfaces its own
 * unavailable/Retry state, matching the previous single-attempt manual load.
 */
export function useCoachMemories(clientId: string) {
  return useQuery({
    queryKey: coachMemoryKeys.byClient(clientId),
    queryFn: () =>
      api.get<{ memories: CoachMemory[] }>(ROUTES.coach.memoriesForClient(clientId), { showErrorToast: false }),
    staleTime: 30 * 1000,
    retry: false,
    select: (result) => result.memories,
  });
}
