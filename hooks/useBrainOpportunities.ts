"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { BrainOpportunity } from "@/lib/brain/opportunities";

export const brainOpportunityKeys = {
  all: ["brain-opportunities"] as const,
  byClient: (clientId: string) => [...brainOpportunityKeys.all, clientId] as const,
};

/**
 * Read side of proactive Brain opportunities. The /brain page SSR-seeds the
 * list (pass it as `initial`; pass `undefined` when the SSR load failed so no
 * data is seeded); the panel never auto-fetches on mount — the query stays
 * `enabled: false` and explicit `refetch()` calls (Retry, after a diagnostic
 * run) do the loading, exactly like the previous manual refresh().
 * approve/dismiss/… patch the cached list via setQueryData from the PATCH
 * response. No retries: the panel surfaces its own unavailable/Retry state.
 */
export function useBrainOpportunities(clientId: string, initial: BrainOpportunity[] | undefined) {
  return useQuery({
    queryKey: brainOpportunityKeys.byClient(clientId),
    queryFn: () =>
      api.get<{ opportunities: BrainOpportunity[] }>(
        ROUTES.brain.opportunitiesForClient(clientId),
        { showErrorToast: false },
      ).then((result) => result.opportunities),
    staleTime: 30 * 1000,
    retry: false,
    initialData: initial,
    enabled: false,
  });
}
