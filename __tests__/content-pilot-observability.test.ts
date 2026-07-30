import { estimateModelCostUsd } from "@/lib/content/pilot-observability";

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
