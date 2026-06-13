/**
 * Tiny in-memory cache for the per-request user role/client lookup done in
 * requireApiAuth. Authenticating an API request validates the JWT (network call,
 * always done) AND then reads the caller's row from `users` to get their role and
 * client_id — a database round-trip on EVERY request. This caches that second
 * lookup per warm serverless instance for a short TTL so hot paths skip it.
 *
 * Safety:
 * - Keyed strictly by the cryptographically-verified auth user id, so it can
 *   never hand back another user's role.
 * - Bounded staleness (ROLE_TTL_MS): a role/tenant change takes effect within the
 *   TTL even on already-issued sessions — far tighter than embedding the role in
 *   the JWT (which stays stale until the token itself refreshes, ~1h).
 * - Module state, same pattern as the rate limiters; each instance keeps its own
 *   copy, so this is a best-effort speedup, never an authority.
 *
 * It deliberately does NOT cache JWT validation — getUser() still runs every
 * request, so a revoked/expired token is always rejected immediately.
 */
export interface CachedIdentity {
  role: string;
  client_id: string | null;
}

export const ROLE_TTL_MS = 30_000;

const cache = new Map<string, { value: CachedIdentity; at: number }>();

/** Return the cached identity for a user id, or null if absent/expired. */
export function getCachedIdentity(userId: string, now: number = Date.now()): CachedIdentity | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (now - hit.at > ROLE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return hit.value;
}

export function setCachedIdentity(userId: string, value: CachedIdentity, now: number = Date.now()): void {
  cache.set(userId, { value, at: now });
}

/** Drop a user's cached identity immediately — call after changing their role. */
export function invalidateCachedIdentity(userId: string): void {
  cache.delete(userId);
}

/** Test-only: empty the cache between cases. */
export function __clearIdentityCache(): void {
  cache.clear();
}
