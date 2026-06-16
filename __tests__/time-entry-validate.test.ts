import { isValidInstant, validateSegmentTimes } from "@/lib/tasks/time-entry-validate";

describe("isValidInstant", () => {
  it("accepts ISO timestamps", () => {
    expect(isValidInstant("2026-06-01T09:00:00Z")).toBe(true);
    expect(isValidInstant("2026-06-01T09:00:00")).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidInstant("not-a-date")).toBe(false);
    expect(isValidInstant("")).toBe(false);
  });
});

describe("validateSegmentTimes", () => {
  it("accepts a valid closed segment", () => {
    expect(validateSegmentTimes("2026-06-01T09:00:00Z", "2026-06-01T11:00:00Z")).toBeNull();
  });
  it("accepts an open segment (no end)", () => {
    expect(validateSegmentTimes("2026-06-01T09:00:00Z", null)).toBeNull();
    expect(validateSegmentTimes("2026-06-01T09:00:00Z", undefined)).toBeNull();
    expect(validateSegmentTimes("2026-06-01T09:00:00Z", "")).toBeNull();
  });
  it("accepts a zero-length segment (end == start)", () => {
    expect(validateSegmentTimes("2026-06-01T09:00:00Z", "2026-06-01T09:00:00Z")).toBeNull();
  });
  it("rejects an unparseable start", () => {
    expect(validateSegmentTimes("nope", "2026-06-01T11:00:00Z")).toMatch(/started_at/);
  });
  it("rejects an unparseable end", () => {
    expect(validateSegmentTimes("2026-06-01T09:00:00Z", "nope")).toMatch(/ended_at/);
  });
  it("rejects end before start", () => {
    expect(validateSegmentTimes("2026-06-01T11:00:00Z", "2026-06-01T09:00:00Z"))
      .toMatch(/before started_at/);
  });
});
