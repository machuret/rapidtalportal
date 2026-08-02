/** @jest-environment node */

jest.mock("@/lib/brain/resolver", () => ({ embedVaultQuery: jest.fn() }));

import { embedVaultQuery } from "@/lib/brain/resolver";
import { recommendedEvidenceIds } from "@/lib/content/evidence-ranking";
import { buildLiveEditorialChecks } from "@/lib/content/live-checks";
import { matchSemanticEvidence } from "@/lib/content/semantic-evidence";

describe("Content editor assistance", () => {
  beforeEach(() => jest.clearAllMocks());

  test("deduplicates semantic chunks and keeps the strongest excerpt per Vault item", async () => {
    (embedVaultQuery as jest.Mock).mockResolvedValue(new Array(384).fill(0.1));
    const rpc = jest.fn().mockResolvedValue({
      data: [
        { id: "chunk-a1", item_id: "item-a", content: "Weak match", similarity: 0.51 },
        { id: "chunk-a2", item_id: "item-a", content: "Strong match", similarity: 0.91 },
        { id: "chunk-b", item_id: "item-b", content: "Below threshold", similarity: 0.2 },
        { id: "chunk-c", item_id: "item-c", content: "Second item", similarity: 0.72 },
      ],
      error: null,
    });

    const result = await matchSemanticEvidence({ rpc }, "client-1", "modular furniture", 40);

    expect(result.available).toBe(true);
    expect(rpc).toHaveBeenCalledWith("match_vault_chunks", expect.objectContaining({
      p_client_id: "client-1",
      p_match_count: 40,
    }));
    expect(result.matches).toEqual([
      expect.objectContaining({ itemId: "item-a", chunkId: "chunk-a2", excerpt: "Strong match", similarity: 0.91 }),
      expect.objectContaining({ itemId: "item-c", similarity: 0.72 }),
    ]);
  });

  test("degrades to lexical ranking when semantic embedding is unavailable", async () => {
    (embedVaultQuery as jest.Mock).mockResolvedValue(null);
    const rpc = jest.fn();
    const result = await matchSemanticEvidence({ rpc }, "client-1", "topic");
    expect(result).toEqual({ available: false, matches: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("preselects recommendations only when the editor has no existing choice", () => {
    const rows = [
      { id: "a", recommended: true },
      { id: "b", recommended: true },
      { id: "c", recommended: false },
      { id: "d", recommended: true },
      { id: "e", recommended: true },
    ];
    expect(recommendedEvidenceIds(rows, [])).toEqual(["a", "b", "d"]);
    expect(recommendedEvidenceIds(rows, ["c"])).toEqual(["c"]);
  });

  test("reports platform, terminology and hard-rule issues while editing", () => {
    const checks = buildLiveEditorialChecks(
      "Buy now. Guaranteed results 😀",
      "linkedin",
      {
        prohibitedPhrases: ["guaranteed results"],
        disallowEmoji: true,
        hardRules: [{ id: "required", type: "require_phrase", value: "Made in Australia", channels: ["linkedin"] }],
      },
    );
    expect(checks.find((check) => check.id === "platform")?.warnings.length).toBeGreaterThan(0);
    expect(checks.find((check) => check.id === "style")?.warnings.join(" ")).toContain("guaranteed results");
    expect(checks.find((check) => check.id === "style")?.warnings.join(" ")).toContain("Remove emoji");
    expect(checks.find((check) => check.id === "hard_rules")?.warnings.join(" ")).toContain("Made in Australia");
  });
});
