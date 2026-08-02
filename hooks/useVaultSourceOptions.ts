"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

export interface VaultSourceOption {
  id: string;
  title: string;
}

interface UseVaultSourceOptionsOptions {
  /**
   * Also restrict to ready + active-knowledge items. KnowledgeGaps needs this
   * (only a source AI may cite can resolve a gap); the drawer supersession
   * picker lists all factual sources regardless of status.
   */
  activeOnly?: boolean;
  /** Omit this item from the list (e.g. the item currently being edited). */
  excludeId?: string;
  /** Fetch on mount (default). Pass false to load lazily via reload(). */
  enabled?: boolean;
}

/**
 * The shared "first 50 factual sources" lookup (GET /api/vault/items) used by
 * the Vault item drawer (supersession picker) and KnowledgeGaps
 * (link-a-source).
 *
 * Failure is non-blocking by contract: it never throws and never toasts —
 * the error surfaces via `error` and reload()'s return value so an editing
 * flow is never blocked by a source-list outage.
 */
export function useVaultSourceOptions(
  clientId: string,
  { activeOnly = false, excludeId, enabled = true }: UseVaultSourceOptionsOptions = {},
) {
  const [options, setOptions] = useState<VaultSourceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Resolves null on success, the Error on failure, so lazy callers can react
  // inline (close a panel, toast) without watching state. Never rejects.
  const reload = useCallback(async (): Promise<Error | null> => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ clientId, evidenceRole: "factual", limit: "50" });
      if (activeOnly) {
        params.set("status", "ready");
        params.set("knowledgeStatus", "active");
      }
      const result = await api.get<{ items: VaultSourceOption[] }>(
        `${ROUTES.vault.items()}?${params.toString()}`,
        { showErrorToast: false },
      );
      if (mountedRef.current && request === requestRef.current) {
        setOptions((result.items ?? []).filter((source) => source.id !== excludeId));
        setLoading(false);
      }
      return null;
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      if (mountedRef.current && request === requestRef.current) {
        setError(failure);
        setLoading(false);
      }
      return failure;
    }
  }, [clientId, activeOnly, excludeId]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { options, loading, error, reload };
}
