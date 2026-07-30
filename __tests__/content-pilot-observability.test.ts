jest.mock("@/lib/error-tracking", () => ({ captureError: jest.fn() }));

import {
  estimateModelCostUsd,
  startAnalysisAttempt,
} from "@/lib/content/pilot-observability";

describe("content pilot model-cost accounting", () => {
  test("uses explicit model prices and rounds to six decimals", () => {
    expect(estimateModelCostUsd("gpt-4.1-mini", 1_000_000, 500_000)).toBe(1.2);
    expect(estimateModelCostUsd("gpt-4o-mini", 1_000, 500)).toBe(0.00045);
  });

  test("unknown models are recorded without inventing a cost", () => {
    expect(estimateModelCostUsd("provider/custom", 10_000, 20_000)).toBe(0);
    expect(estimateModelCostUsd(null, -1, -1)).toBe(0);
  });
});

describe("content analysis attempt recovery", () => {
  function insertChain(result: { data: unknown; error: unknown }) {
    const builder = {
      select: jest.fn(),
      single: jest.fn().mockResolvedValue(result),
    };
    builder.select.mockReturnValue(builder);
    return builder;
  }

  test("expires stale leases before creating a durable attempt", async () => {
    const inserted = insertChain({
      data: { id: "attempt-id", lease_token: "lease-token" },
      error: null,
    });
    const events = { insert: jest.fn().mockResolvedValue({ error: null }) };
    const db = {
      rpc: jest.fn().mockResolvedValue({ data: 2, error: null }),
      from: jest.fn((table: string) => table === "content_analysis_attempts"
        ? { insert: jest.fn(() => inserted) }
        : events),
    };

    await expect(startAnalysisAttempt(db, {
      clientId: "11111111-1111-4111-8111-111111111111",
      actorId: "22222222-2222-4222-8222-222222222222",
      kind: "style_analysis",
    })).resolves.toEqual({ id: "attempt-id", lease_token: "lease-token" });
    expect(db.rpc).toHaveBeenCalledWith("expire_stale_content_analysis_attempts", {});
    expect(db.from).toHaveBeenCalledWith("content_analysis_attempts");
    expect(events.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "analysis_started",
    }));
  });

  test("fails closed when stale-attempt recovery cannot be recorded", async () => {
    const db = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: new Error("database unavailable"),
      }),
      from: jest.fn(),
    };

    await expect(startAnalysisAttempt(db, {
      clientId: "11111111-1111-4111-8111-111111111111",
      actorId: "22222222-2222-4222-8222-222222222222",
      kind: "competitor_intelligence",
    })).rejects.toThrow("database unavailable");
    expect(db.from).not.toHaveBeenCalled();
  });
});
