/**
 * Per-user rate limiting for expensive or sensitive endpoints.
 *
 * Sliding-window, in-memory. On serverless this is per-instance and resets on
 * cold starts, so treat it as a speed bump against abuse and runaway loops —
 * not a hard guarantee. (For hard guarantees, swap the store for Redis/Upstash;
 * the call sites won't need to change.)
 *
 * Keys should identify the caller AND the action, e.g. `ask:<userId>` or
 * `reveal:<userId>`, so one user hitting a limit never affects another.
 */
import { NextResponse } from "next/server";

const MAX_TRACKED_KEYS = 5000;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(private maxRequests: number, private windowMs: number) {}

  /** Records a hit and reports whether the caller is within the limit. */
  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      // Time until the oldest hit in the window expires.
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    this.hits.set(key, recent);

    // Bound memory: if the map grows past the cap, sweep out idle keys.
    if (this.hits.size > MAX_TRACKED_KEYS) {
      Array.from(this.hits.entries()).forEach(([k, ts]) => {
        if (!ts.some((t) => t > windowStart)) this.hits.delete(k);
      });
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: `Too many requests. Try again in ${retryAfterSeconds}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

// ── Endpoint limiters ─────────────────────────────────────────────
// Ask the Vault hits OpenRouter (real money per call). 20 questions per
// 5 minutes per user is far above any honest usage.
export const askVaultLimiter = new SlidingWindowLimiter(20, 5 * 60_000);

// Revealing stored passwords. Generous for a working VA, but stops a
// compromised session from bulk-exporting an entire credential vault in
// seconds — the reveal audit log captures whatever does get through.
export const credentialRevealLimiter = new SlidingWindowLimiter(30, 5 * 60_000);

// Starting a full-site crawl: each one consumes Firecrawl credits for up to
// ~50 pages plus LLM synthesis. A handful per window is plenty.
export const siteCrawlLimiter = new SlidingWindowLimiter(3, 15 * 60_000);

// Deep "Expanded View" analysis: one frontier-model call over the whole
// corpus. Generated on demand and rarely re-run, so a few per hour is ample.
export const deepAnalysisLimiter = new SlidingWindowLimiter(6, 60 * 60_000);

// Refreshing the Company Dossier from the current vault — one synthesis call.
export const briefingLimiter = new SlidingWindowLimiter(8, 60 * 60_000);

// Browser error reports — enough for real bugs, useless for flooding.
export const clientErrorLimiter = new SlidingWindowLimiter(10, 5 * 60_000);

// SOP Studio AI (suggest + generate). Admins iterate, so generous.
export const sopAiLimiter = new SlidingWindowLimiter(30, 10 * 60_000);

// Tools hub (SEO etc.) — each run is a paid LLM call. Generous for real work.
export const toolsLimiter = new SlidingWindowLimiter(40, 10 * 60_000);

// AI generation surface — content pieces, content topics, KB articles, and the
// Brain onboarding draft. Each is a paid LLM call; without a cap an authenticated
// user could hammer generation and run up an unbounded bill. Generous for real
// iterative work (~4/min sustained), fatal to a runaway loop.
export const aiGenerateLimiter = new SlidingWindowLimiter(20, 5 * 60_000);

// Company DNA scrape — a Firecrawl fetch plus LLM synthesis. Rarely re-run.
export const scrapeLimiter = new SlidingWindowLimiter(6, 15 * 60_000);

// Vault ingestion (upload/URL) — parse + embedding fan-out per document. High
// enough for a genuine bulk-upload session, low enough to stop a flood of paid
// indexing from one caller.
export const vaultUploadLimiter = new SlidingWindowLimiter(40, 5 * 60_000);

// Sending a message — fans out in-app notifications AND email to recipients, so
// it's an email-bomb / spam vector. Plenty for a real conversation.
export const messageSendLimiter = new SlidingWindowLimiter(30, 5 * 60_000);
