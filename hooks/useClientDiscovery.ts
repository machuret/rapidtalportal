"use client";

import { useEffect, useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import type { ClientDiscoveryResponse } from "@/lib/discovery/types";

const EMPTY: ClientDiscoveryResponse = { results: [], partial: false, unavailableKinds: [] };

/** Debounced, abortable global record search. A stale response can never
 * replace results for a newer query, and failures remain recoverable in-place. */
export function useClientDiscovery(query: string, enabled: boolean) {
  const [response, setResponse] = useState<ClientDiscoveryResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (!enabled || value.length < 2) {
      setResponse(EMPTY);
      setLoading(false);
      setError(false);
      return;
    }
    // Never leave results for the previous words clickable while the next
    // debounced request is pending.
    setResponse(EMPTY);
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetch(ROUTES.discovery.search(), {
          method: "POST",
          signal: controller.signal,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ q: value, limit: expanded ? 25 : 8 }),
        });
        if (!result.ok) throw new Error("Discovery unavailable.");
        const body = await result.json() as ClientDiscoveryResponse;
        if (!controller.signal.aborted) setResponse(body);
      } catch {
        if (!controller.signal.aborted) {
          setResponse(EMPTY);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, expanded, query, retry]);

  useEffect(() => {
    setExpanded(false);
  }, [query]);

  return {
    ...response,
    loading,
    error,
    expanded,
    expand: () => setExpanded(true),
    retry: () => setRetry((value) => value + 1),
  };
}
