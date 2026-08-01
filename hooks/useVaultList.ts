"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
  counts: VaultCounts | null;
}

export interface VaultListFilters {
  q?: string;
  category?: string; // VaultCategory | "all"
  type?: string;     // source_type | "all"
  status?: string;
  evidenceRole?: "factual" | "style_example" | "market_context";
  knowledgeStatus?: "active" | "review_required" | "superseded";
}

const EMPTY_COUNTS: VaultCounts = { total: 0, ready: 0, processing: 0, error: 0 };

/** Query-key prefix — invalidate this to refresh the list across all filters. */
export const vaultListKeys = {
  all: (clientId: string) => ["vault-list", clientId] as const,
};

/**
 * Server-side, paginated + searchable Vault list (scales per-tenant).
 * Owns the list query, Realtime invalidation, and the delete/reprocess
 * mutations. Pairs with GET /api/vault/items + FTS index (020_vault_search.sql).
 */
export function useVaultList(clientId: string, filters: VaultListFilters = {}) {
  const queryClient = useQueryClient();
  const {
    q = "",
    category = "all",
    type = "all",
    status,
    evidenceRole,
    knowledgeStatus,
  } = filters;

  const query = useInfiniteQuery({
    queryKey: [
      ...vaultListKeys.all(clientId),
      { q, category, type, status, evidenceRole, knowledgeStatus },
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ clientId, page: String(pageParam) });
      if (q) params.set("q", q);
      if (category && category !== "all") params.set("category", category);
      if (type && type !== "all") params.set("type", type);
      if (status) params.set("status", status);
      if (evidenceRole) params.set("evidenceRole", evidenceRole);
      if (knowledgeStatus) params.set("knowledgeStatus", knowledgeStatus);
      return api.get<VaultPage>(`${ROUTES.vault.items()}?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextPage,
    staleTime: 30 * 1000,
  });

  // ── Realtime — invalidate (refetch) on any change to this client's items ────
  // Trailing-debounced: during crawls/bulk indexing, vault-process writes rows
  // continuously and an un-debounced invalidate refetches EVERY loaded page per
  // event. Coalesce bursts into one refetch per 1.5s quiet window.
  const supabaseRef = useRef(createClient());
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = supabaseRef.current;
    const scheduleInvalidate = () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      invalidateTimer.current = setTimeout(() => {
        invalidateTimer.current = null;
        queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
      }, 1500);
    };
    const channel = supabase
      .channel(`vault-list:${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vault_items", filter: `client_id=eq.${clientId}` },
        scheduleInvalidate
      )
      .subscribe();
    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);

  // ── Mutations — invalidate the list on settle ───────────────────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });

  const deleteMutation = useMutation({
    mutationFn: (input: { itemIds: string[]; clientId: string }) =>
      api.post<{ deleted?: number }>(ROUTES.vault.delete(), input, { showErrorToast: false }),
    onSettled: invalidate,
  });

  const reprocessMutation = useMutation({
    mutationFn: (input: { id: string; clientId: string }) =>
      // Manual "re-run AI" → rebuild (refresh summary + re-embed from scratch).
      api.post(ROUTES.vault.reprocess(input.id), { clientId: input.clientId, rebuild: true }, { showErrorToast: false }),
    onSettled: invalidate,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = query.data?.pages[0]?.counts ?? EMPTY_COUNTS;

  return {
    items,
    counts,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error,
    isError: query.isError,

    deleteItems: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    reprocessItem: reprocessMutation.mutateAsync,
  };
}
