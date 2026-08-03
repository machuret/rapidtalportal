const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;

/** Supabase has no universal request deadline by default. Apply one at the
 * transport boundary so every database read—server or browser—eventually
 * reaches the portal's recoverable error path. Existing caller abort signals
 * remain authoritative. */
export function boundedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}
