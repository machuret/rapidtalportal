import { NextResponse } from "next/server";
import { captureError } from "@/lib/error-tracking";

/**
 * Standard 500 response for a failed DB / internal operation.
 *
 * Why: dozens of routes used to `return NextResponse.json({ error: error.message })`
 * straight from a Supabase error. That both (a) leaked Postgres internals
 * (column/constraint names) to the caller and (b) logged nothing. `serverError`
 * records the real error to /admin/errors via captureError and returns the same
 * generic, non-leaky message the `withAuth` wrapper uses for thrown errors.
 *
 * Use it for the internal "this shouldn't fail" branch (status 500). Do NOT use
 * it for user-facing validation feedback (e.g. Supabase auth password errors,
 * Zod 4xx) — those messages are intentional and should still be returned.
 */
export function serverError(
  err: unknown,
  ctx?: { userId?: string | null; clientId?: string | null; url?: string | null },
): NextResponse {
  captureError("api", err, ctx ?? {});
  return NextResponse.json(
    { error: "Something went wrong on our side. The team has been notified." },
    { status: 500 },
  );
}
