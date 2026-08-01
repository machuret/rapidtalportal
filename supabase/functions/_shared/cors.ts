/**
 * Shared CORS policy for the RapidTal edge functions.
 *
 * Every function uses the same policy: one configurable origin
 * (ALLOWED_ORIGIN, defaulting to the production portal), the standard
 * Supabase client headers, and POST-only methods. The OPTIONS preflight
 * must answer "ok" with these headers — browsers gate the real request on it.
 *
 * The header values are part of each function's public contract; do not
 * change them without auditing every caller.
 */

export const DEFAULT_ALLOWED_ORIGIN = "https://rapidtal.online";

export const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function readAllowedOrigin(): string {
  try {
    return Deno.env.get("ALLOWED_ORIGIN") ?? DEFAULT_ALLOWED_ORIGIN;
  } catch {
    // No env permission (e.g. `deno test` without --allow-env) — fall back
    // to the default origin.
    return DEFAULT_ALLOWED_ORIGIN;
  }
}

export function buildCorsHeaders(
  origin: string = readAllowedOrigin(),
): Record<string, string> {
  return { ...baseCorsHeaders, "Access-Control-Allow-Origin": origin };
}

export const corsHeaders = buildCorsHeaders();

/** Answers a CORS preflight exactly the way each function did inline. */
export function handleOptions(
  headers: Record<string, string> = corsHeaders,
): Response {
  return new Response("ok", { headers });
}

/** JSON response with the shared CORS headers — byte-identical to the
 * per-function `new Response(JSON.stringify(body), { status, headers })`. */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = corsHeaders,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
