/**
 * Utility to proxy authenticated Next.js API requests to Supabase Edge Functions.
 *
 * Auth flow:
 *   1. getUser() — hits the Supabase Auth server to cryptographically verify the JWT.
 *      This is the ONLY safe server-side auth check. getSession() must NOT be used
 *      here because it only reads and decodes the cookie locally without verification —
 *      a crafted cookie would pass getSession() but fail getUser().
 *   2. getSession() is called separately ONLY to extract the access_token for forwarding.
 *      By this point the user is already verified by getUser().
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { captureError } from "@/lib/error-tracking";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function proxyToEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });

  // Step 1: Verify identity — getUser() makes a network call to Supabase Auth
  // to validate the JWT signature. This cannot be spoofed with a crafted cookie.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Step 2: Extract the raw access token to forward to the edge function.
  // getSession() is safe here — we only need the token string, identity already verified above.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const edgeUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;

  try {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    // Parse defensively — some edge functions (e.g. vault-process) return an
    // empty body, which would make res.json() throw "Unexpected end of JSON
    // input" and surface as a 502 in /admin/errors.
    const raw = await res.text();
    let data: unknown = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        captureError("proxy", new Error(`Non-JSON response from edge:${functionName} (status ${res.status})`), { userId: user.id, url: `edge:${functionName}` });
        return NextResponse.json(
          { error: "The edge function returned an unexpected response." },
          { status: res.status >= 400 ? res.status : 502 },
        );
      }
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    captureError("proxy", err, { userId: user.id, url: `edge:${functionName}` });
    return NextResponse.json(
      { error: "Failed to reach edge function." },
      { status: 502 },
    );
  }
}

/**
 * Like proxyToEdgeFunction but pipes a streaming (SSE) response straight through
 * to the browser instead of buffering JSON. Forwards the X-Vault-Sources header.
 * Returns a non-OK JSON response on failure so the client can fall back.
 */
export async function streamEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      return NextResponse.json({ error: "stream unavailable" }, { status: res.status || 502 });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Vault-Sources": res.headers.get("X-Vault-Sources") ?? "",
      },
    });
  } catch (err) {
    captureError("proxy", err, { userId: user.id, url: `edge:${functionName}` });
    return NextResponse.json({ error: "Failed to reach edge function." }, { status: 502 });
  }
}
