/**
 * Full-site crawl — start + status.
 *
 * POST — kick off a site crawl: creates a crawl_jobs row and submits the crawl
 *        to Firecrawl's async API. Firecrawl does discovery + scraping on its
 *        own infrastructure; our /advance endpoint ingests the results in
 *        small idempotent ticks.
 * GET  — latest job for a client (the Vault page uses this to resume/display).
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { siteCrawlLimiter, tooManyRequests } from "@/lib/rate-limit";
import { errorMessage } from "@/lib/error-message";
import { isBlockedUrl } from "@/lib/security/ssrf";

const PAGE_CAP = 50;

const startSchema = z.object({
  clientId: z.string().uuid(),
  url: z.string().url(),
});

// SSRF guard is shared + hardened in lib/security/ssrf.ts (isBlockedUrl).

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crawl_jobs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return serverError(error, {
    userId: user.id,
    clientId,
    url: "/api/vault/crawl-site",
  });

  return NextResponse.json({ job: data ?? null });
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid https URL is required." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  if (isBlockedUrl(parsed.data.url)) {
    return NextResponse.json({ error: "Only public HTTPS URLs can be crawled." }, { status: 400 });
  }

  const rl = await siteCrawlLimiter.check(`site-crawl:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    return NextResponse.json({ error: "FIRECRAWL_API_KEY is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();

  // One active crawl per client at a time — they're heavyweight.
  // Advance is UI-driven, so an "active" job may be abandoned (tab closed
  // forever): auto-fail jobs untouched for 24h instead of blocking forever.
  const staleCutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
  await admin
    .from("crawl_jobs")
    .update({
      status: "error",
      error: "Crawl abandoned — no progress for 24 hours.",
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", parsed.data.clientId)
    .in("status", ["crawling", "ingesting", "synthesizing"])
    .lt("updated_at", staleCutoff);

  const { data: active, error: activeError } = await admin
    .from("crawl_jobs")
    .select("id, status")
    .eq("client_id", parsed.data.clientId)
    .in("status", ["crawling", "ingesting", "synthesizing"])
    .limit(1)
    .maybeSingle();
  if (activeError) return serverError(activeError, {
    userId: user.id,
    clientId: parsed.data.clientId,
    url: "/api/vault/crawl-site",
  });
  if (active) {
    return NextResponse.json({ error: "A crawl is already running for this client. Let it finish first." }, { status: 409 });
  }

  // Submit to Firecrawl's async crawl API. Account/cart/legal paths are
  // excluded up front so they never consume crawl credits.
  const fcRes = await fetch("https://api.firecrawl.dev/v1/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({
      url: parsed.data.url,
      limit: PAGE_CAP,
      excludePaths: ["cart", "checkout", "account", "login", "register", "wishlist", "search"],
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true, waitFor: 2000, timeout: 45000 },
    }),
    signal: AbortSignal.timeout(50_000),
  });
  const fcJson = await fcRes.json().catch(() => ({}));
  if (!fcRes.ok || !fcJson?.id) {
    return NextResponse.json(
      { error: `Couldn't start the crawl: ${errorMessage(fcJson, `Firecrawl returned ${fcRes.status}`)}` },
      { status: 502 },
    );
  }

  const { data: job, error } = await admin
    .from("crawl_jobs")
    .insert({
      client_id: parsed.data.clientId,
      created_by: user.id,
      url: parsed.data.url,
      status: "crawling",
      firecrawl_id: fcJson.id as string,
      page_cap: PAGE_CAP,
    })
    .select("*")
    .single();

  if (error) return serverError(error);
  return NextResponse.json({ job }, { status: 201 });
});
