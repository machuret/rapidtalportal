/**
 * @jest-environment node
 *
 * Sliding-window rate limiter tests: requests under the limit pass, the
 * request over the limit is rejected with a sane Retry-After, the window
 * actually slides (old hits expire), and keys are independent so one user
 * being throttled never affects another.
 */
import { SlidingWindowLimiter, tooManyRequests } from "@/lib/rate-limit";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test("allows up to the limit, then rejects", () => {
    const limiter = new SlidingWindowLimiter(3, 60_000);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    const fourth = limiter.check("u1");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  test("the window slides — old hits expire and requests pass again", () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    limiter.check("u1");
    limiter.check("u1");
    expect(limiter.check("u1").allowed).toBe(false);
    jest.advanceTimersByTime(61_000);
    expect(limiter.check("u1").allowed).toBe(true);
  });

  test("keys are independent", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(false);
    expect(limiter.check("u2").allowed).toBe(true);
  });

  test("tooManyRequests returns 429 with a Retry-After header", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await res.json();
    expect(body.error).toContain("42");
  });
});
