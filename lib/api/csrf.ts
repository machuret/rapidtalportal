/**
 * CSRF defence-in-depth for cookie-authenticated mutations.
 *
 * Browsers always send an `Origin` header on state-changing requests; a
 * same-origin call's Origin host matches the request Host, while a forged
 * cross-site form post carries the attacker's Origin. Server-to-server / cron
 * calls send no Origin and are allowed through (they don't ride the user's
 * cookie anyway). Kept dependency-free (no next/server import) so it stays
 * unit-testable in isolation.
 */

/** Just the slice of a request the guard reads — NextRequest satisfies this. */
export interface OriginCheckable {
  method: string;
  headers: { get(name: string): string | null };
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function originRejected(req: OriginCheckable): boolean {
  if (!MUTATING_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}
