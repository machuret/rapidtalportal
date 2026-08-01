/**
 * @jest-environment node
 *
 * Sliding-window rate limiter tests: requests under the limit pass, the
 * request over the limit is rejected with a sane Retry-After, the window
 * actually slides (old hits expire), and keys are independent so one user
 * being throttled never affects another.
 *
 * These exercise the in-memory backend — UPSTASH_REDIS_REST_* is unset in the
 * test env, so every limiter degrades to in-memory.
 */
import { SlidingWindowLimiter, tooManyRequests } from "@/lib/rate-limit";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test("allows up to the limit, then rejects", async () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    expect((await limiter.check("u1")).allowed).toBe(true);
    expect((await limiter.check("u1")).allowed).toBe(true);
    expect((await limiter.check("u1")).allowed).toBe(true);
    const fourth = await limiter.check("u1");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  test("the window slides — old hits expire and requests pass again", async () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    await limiter.check("u1");
    await limiter.check("u1");
    expect((await limiter.check("u1")).allowed).toBe(false);
    jest.advanceTimersByTime(61_000);
    expect((await limiter.check("u1")).allowed).toBe(true);
  });

  test("keys are independent", async () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect((await limiter.check("u1")).allowed).toBe(true);
    expect((await limiter.check("u1")).allowed).toBe(false);
    expect((await limiter.check("u2")).allowed).toBe(true);
  });

  test("tooManyRequests returns 429 with a Retry-After header", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await res.json();
    expect(body.error).toContain("42");
  });
});
