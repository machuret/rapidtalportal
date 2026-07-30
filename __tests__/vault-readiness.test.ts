/** @jest-environment node */

import { evaluateVaultReadiness } from "@/lib/vault/readiness";
import type { VaultCategory } from "@/types/database";

const NOW = new Date("2026-07-30T00:00:00.000Z");

function item(
  category: VaultCategory,
  overrides: Partial<Parameters<typeof evaluateVaultReadiness>[0]["items"][number]> = {},
) {
  return {
    status: "ready",
    category,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
    indexed_at: "2026-07-20T00:01:00.000Z",
    ...overrides,
  };
}

describe("Vault readiness scoring", () => {
  test("gives an empty Vault a clear setup action instead of a misleading score", () => {
    const result = evaluateVaultReadiness({ items: [], gaps: [], now: NOW });

    expect(result).toMatchObject({
      score: 0,
      status: "setup",
      label: "Setup required",
    });
    expect(result.recommendations[0]).toMatchObject({
      id: "start",
      action: "add",
      priority: "high",
    });
  });

  test("recognises a searchable, fresh and broadly covered Vault as ready", () => {
    const result = evaluateVaultReadiness({
      items: [
        item("service"),
        item("process"),
        item("policy"),
        item("reference"),
      ],
      gaps: [],
      questionCount: 10,
      now: NOW,
    });

    expect(result.score).toBe(100);
    expect(result.status).toBe("ready");
    expect(result.missingCoreCategories).toEqual([]);
    expect(result.metrics).toMatchObject({
      ready: 4,
      searchable: 4,
      stale: 0,
      openGaps: 0,
      questionsTested: 10,
    });
  });

  test("treats failed and unsearchable knowledge as release-blocking health issues", () => {
    const result = evaluateVaultReadiness({
      items: [
        item("service", { indexed_at: null }),
        item("process", { status: "error", indexed_at: null }),
      ],
      gaps: [],
      questionCount: 5,
      now: NOW,
    });

    expect(result.status).toBe("needs_attention");
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "failed", action: "index", priority: "high" }),
      expect.objectContaining({ id: "unsearchable", action: "index", priority: "high" }),
    ]));
  });

  test("turns long-running preparation into a visible recovery action", () => {
    const result = evaluateVaultReadiness({
      items: [
        item("service", {
          status: "processing",
          updated_at: "2026-07-29T12:00:00.000Z",
          indexed_at: null,
        }),
      ],
      gaps: [],
      now: NOW,
    });

    expect(result.metrics).toMatchObject({
      processing: 0,
      stuckProcessing: 1,
    });
    expect(result.status).toBe("needs_attention");
    expect(result.recommendations).toContainEqual(expect.objectContaining({
      id: "stuck-processing",
      action: "index",
      priority: "high",
    }));
  });

  test("does not treat an untested Vault as proven ready", () => {
    const result = evaluateVaultReadiness({
      items: [
        item("service"),
        item("process"),
        item("policy"),
        item("reference"),
      ],
      gaps: [],
      questionCount: 0,
      now: NOW,
    });

    expect(result.status).toBe("developing");
    expect(result.score).toBe(90);
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "test", action: "ask" }),
    ]));
  });

  test("discloses stale sources, coverage gaps and real unanswered questions", () => {
    const result = evaluateVaultReadiness({
      items: [
        item("service", {
          updated_at: "2024-01-01T00:00:00.000Z",
        }),
      ],
      gaps: ["What is the current approval process?", "What is the current approval process?"],
      now: NOW,
    });

    expect(result.metrics.stale).toBe(1);
    expect(result.metrics.openGaps).toBe(1);
    expect(result.missingCoreCategories).toEqual(["process", "policy", "reference"]);
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "coverage", action: "add" }),
      expect.objectContaining({ id: "stale" }),
      expect.objectContaining({ id: "gaps", action: "gaps" }),
    ]));
  });

  test("excludes expired and conflicting sources and exposes governed topic strength", () => {
    const result = evaluateVaultReadiness({
      items: [
        item("service", {
          id: "one",
          tags: ["private_lending"],
          authority_level: "authoritative",
        }),
        item("reference", {
          id: "two",
          tags: ["private lending"],
        }),
        item("policy", {
          id: "expired",
          tags: ["compliance"],
          valid_until: "2026-07-01",
          time_sensitive: true,
        }),
        item("process", {
          id: "conflict",
          tags: ["approvals"],
          has_conflict: true,
        }),
      ],
      gaps: [],
      questionCount: 4,
      now: NOW,
    });

    expect(result.status).toBe("needs_attention");
    expect(result.metrics).toMatchObject({
      ready: 2,
      expired: 1,
      conflicted: 1,
      authoritative: 1,
      timeSensitive: 1,
    });
    expect(result.topics).toContainEqual(expect.objectContaining({
      topic: "private lending",
      sourceCount: 2,
      authoritativeCount: 1,
      strength: "moderate",
    }));
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "governance", action: "review", priority: "high" }),
    ]));
  });
});
