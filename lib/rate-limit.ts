/**
 * Per-user rate limiting for expensive or sensitive endpoints.
 *
 * Two backends, selected automatically:
 *
 * - **Upstash Redis** — active when `UPSTASH_REDIS_REST_URL` and
 *   `UPSTASH_REDIS_REST_TOKEN` are set. The sliding window lives in Redis, so
 *   limits hold across serverless instances and cold starts. This is the
 *   production backend.
 * - **In-memory** — fallback for local dev and for any instance where Redis is
 *   not configured (or unreachable). Sliding-window per instance; resets on
 *   cold start, so treat it as a speed bump, not a guarantee.
 *
 * If the Redis call itself fails, the limiter degrades to the in-memory check
 * for that request (fail-open) rather than taking the endpoint down — rate
 * limiting must never be the reason the app is unavailable.
 *
 * Keys should identify the caller AND the action, e.g. `ask:<userId>` or
 * `reveal:<userId>`, so one user hitting a limit never affects another.
 */
import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const MAX_TRACKED_KEYS = 5000;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private distributed: Ratelimit | null;

  constructor(private maxRequests: number, private windowMs: number) {
    this.distributed = redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
          // Namespace per limiter instance so two limiters can never collide
          // even if a call site reuses a key prefix.
          prefix: `rl:${maxRequests}:${windowMs}`,
          analytics: false,
        })
      : null;
  }

  /** Records a hit and reports whether the caller is within the limit. */
  async check(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    if (this.distributed) {
      try {
        const { success, reset } = await this.distributed.limit(key);
        return {
          allowed: success,
          retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
        };
      } catch {
        // Redis unreachable — fall through to the in-memory check (fail-open).
      }
    }
    return this.checkInMemory(key);
  }

  private checkInMemory(key: string): { allowed: boolean; retryAfterSeconds: number } {
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
// Ask the Brain hits OpenRouter (real money per call). 20 questions per
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

// Lead discovery starts paid Apify Actors. The database also enforces a
// tenant-wide daily run/result budget; this limiter stops rapid repeat clicks
// before they reach that durable boundary.
export const leadGenerationLimiter = new SlidingWindowLimiter(5, 15 * 60_000);

// Sending a message — fans out in-app notifications AND email to recipients, so
// it's an email-bomb / spam vector. Plenty for a real conversation.
export const messageSendLimiter = new SlidingWindowLimiter(30, 5 * 60_000);
