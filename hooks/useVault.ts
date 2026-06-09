"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { DbVaultItem } from "@/types/database";

const VAULT_KEY = "vault";

const VAULT_SELECT =
  "id, client_id, source_type, title, source_url, storage_path, status, error_message, created_at, created_by, category, tags, ai_summary, updated_at, updated_by";

// Query Keys
export const vaultKeys = {
  all: [VAULT_KEY] as const,
  byClient: (clientId: string) => [VAULT_KEY, clientId] as const,
};

// ── Inputs ──────────────────────────────────────────────────────────────────

interface DeleteVaultInput {
  itemIds: string[];
  clientId: string;
}

interface ReprocessVaultInput {
  id: string;
  clientId: string;
}

interface DeleteResponse {
  deleted?: number;
}

// ── Fetch (Supabase, mirrors VaultClient's original query) ──────────────────

async function fetchVaultItems(
  supabase: ReturnType<typeof createClient>,
  clientId: string
): Promise<DbVaultItem[]> {
  const { data, error } = await supabase
    .from("vault_items")
    .select(VAULT_SELECT)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[useVault] load error:", error.message, error.details);
    throw new Error(`Failed to load vault items: ${error.message}`);
  }
  return (data ?? []) as DbVaultItem[];
}

// ── Mutations (JSON endpoints via api client) ───────────────────────────────

async function deleteVaultItems(input: DeleteVaultInput): Promise<DeleteResponse> {
  return api.post<DeleteResponse>(ROUTES.vault.delete(), {
    itemIds: input.itemIds,
    clientId: input.clientId,
  });
}

async function reprocessVaultItem(input: ReprocessVaultInput): Promise<unknown> {
  return api.post(ROUTES.vault.reprocess(input.id), { clientId: input.clientId });
}

/**
 * Shared vault list query + write mutations.
 *
 * The list is sourced from Supabase directly (not a REST endpoint) and kept
 * live via Realtime — the subscription patches the React Query cache so the
 * query remains the single source of truth.
 */
export function useVault(clientId: string, initialItems: DbVaultItem[] = []) {
  const queryClient = useQueryClient();
  // Stabilise the Supabase client — createClient() must not be called on every
  // render because each call creates a new instance, multiplying Realtime channels.
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const itemsQuery = useQuery({
    queryKey: vaultKeys.byClient(clientId),
    queryFn: () => fetchVaultItems(supabase, clientId),
    initialData: initialItems.length ? initialItems : undefined,
    placeholderData: initialItems.length ? initialItems : undefined,
  });

  // ── Supabase Realtime — patch the query cache on live updates ─────────────
  useEffect(() => {
    const key = vaultKeys.byClient(clientId);
    const channel = supabase
      .channel(`vault:${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vault_items", filter: `client_id=eq.${clientId}` },
        (payload) => {
          queryClient.setQueryData<DbVaultItem[]>(key, (prev = []) => {
            const incoming = payload.new as DbVaultItem;
            if (prev.some(i => i.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vault_items", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const incoming = payload.new as DbVaultItem;
          queryClient.setQueryData<DbVaultItem[]>(key, (prev = []) =>
            prev.map(i => i.id === incoming.id ? incoming : i)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "vault_items", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const removedId = (payload.old as { id: string }).id;
          queryClient.setQueryData<DbVaultItem[]>(key, (prev = []) =>
            prev.filter(i => i.id !== removedId)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId, supabase, queryClient]);

  // Delete (single or bulk). Realtime DELETE handles list removal, so no
  // optimistic local mutation here — invalidate on settle to reconcile.
  const deleteMutation = useMutation({
    mutationFn: deleteVaultItems,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: vaultKeys.byClient(clientId) });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: reprocessVaultItem,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: vaultKeys.byClient(clientId) });
    },
  });

  return {
    items: itemsQuery.data ?? initialItems,
    isLoading: itemsQuery.isLoading,
    isRefetching: itemsQuery.isRefetching,
    refetch: itemsQuery.refetch,

    deleteItems: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,

    reprocessItem: reprocessMutation.mutateAsync,
    isReprocessing: reprocessMutation.isPending,
  };
}
