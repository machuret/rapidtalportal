"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { DbVaultItem } from "@/types/database";

export interface VaultCounts {
  total: number;
  ready: number;
  processing: number;
  error: number;
}

interface VaultPage {
  items: DbVaultItem[];
  page: number;
  nextPage: number | null;
  counts: VaultCounts;
}

export interface VaultListFilters {
  q?: string;
  category?: string; // VaultCategory | "all"
  status?: string;
}

/**
 * Server-side, paginated + searchable Vault list (scales per-tenant).
 * Pairs with GET /api/vault/items + the FTS index (020_vault_search.sql).
 *
 * This is the scalable replacement for useVault's "load 100 + filter in memory"
 * query. Wiring VaultClient over to it (incl. reconciling Realtime with paging)
 * is the remaining step.
 */
export function useVaultList(clientId: string, filters: VaultListFilters = {}) {
  const { q = "", category = "all", status } = filters;

  const query = useInfiniteQuery({
    queryKey: ["vault-list", clientId, { q, category, status }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ clientId, page: String(pageParam) });
      if (q) params.set("q", q);
      if (category && category !== "all") params.set("category", category);
      if (status) params.set("status", status);
      return api.get<VaultPage>(`${ROUTES.vault.items()}?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextPage,
    staleTime: 30 * 1000,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = query.data?.pages[0]?.counts ?? { total: 0, ready: 0, processing: 0, error: 0 };

  return {
    items,
    counts,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
