"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

export type CoachGoal = {
  id: string; title: string; outcome: string; status: "active" | "paused" | "achieved" | "abandoned";
  progress: number; target_date: string | null; achieved_at?: string | null; updated_at?: string;
};

export type CoachCommitment = {
  id: string; goal_id: string | null; commitment: string;
  status: "open" | "completed" | "snoozed" | "dismissed"; due_date: string | null;
  next_check_in_at: string | null; completed_at?: string | null; updated_at?: string;
};

export type CoachProgressData = {
  goals: CoachGoal[];
  commitments: CoachCommitment[];
};

export const coachProgressKeys = {
  all: ["coach-progress"] as const,
  byClient: (clientId: string) => [...coachProgressKeys.all, clientId] as const,
};

/**
 * Read side of the private coaching plan (goals + commitments) for
 * CoachProgressPanel. Mutations stay in the panel; they and the
 * "coach-progress-changed" window event invalidate this key.
 * No retries: the panel surfaces its own unavailable/Retry state, matching
 * the previous single-attempt manual load.
 */
export function useCoachProgress(clientId: string) {
  return useQuery({
    queryKey: coachProgressKeys.byClient(clientId),
    queryFn: () =>
      api.get<CoachProgressData>(ROUTES.coach.progressForClient(clientId), { showErrorToast: false }),
    staleTime: 30 * 1000,
    retry: false,
  });
}
