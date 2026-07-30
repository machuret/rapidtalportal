/**
 * Self-owned error tracking: unhandled API errors and reported browser errors
 * land in app_errors, surfaced at /admin/errors. Zero external vendors —
 * if the product outgrows this, swap captureError's body for a Sentry call
 * and every call site keeps working.
 *
 * captureError NEVER throws and is storm-capped: an error loop can't take
 * the app down a second time by flooding the database.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/error-message";

const MAX_CAPTURES_PER_MINUTE = 30;
let windowStart = 0;
let captured = 0;

export function captureError(
  source: "api" | "client" | "proxy",
  err: unknown,
  ctx: { userId?: string | null; clientId?: string | null; url?: string | null } = {},
): void {
  try {
    const now = Date.now();
    if (now - windowStart > 60_000) { windowStart = now; captured = 0; }
    if (++captured > MAX_CAPTURES_PER_MINUTE) return;

    const message = errorMessage(err, "Unknown application error.");
    const stack = err instanceof Error ? err.stack ?? null : null;
    console.error(`[${source}]`, ctx.url ?? "", message);

    const admin = createAdminClient();
    void admin
      .from("app_errors")
      .insert({
        source,
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000) ?? null,
        url: ctx.url?.slice(0, 500) ?? null,
        user_id: ctx.userId ?? null,
        client_id: ctx.clientId ?? null,
      })
      .then(({ error }) => { if (error) console.error("[captureError] insert failed:", error.message); });
  } catch {
    /* never let error tracking cause an error */
  }
}
