import {
  brainMemoryScopeMatches,
  isBrainMemoryScopeExpansion,
  normalizeBrainMemoryScope,
} from "@/supabase/functions/_shared/brain-memory-scope";
import { selectBrainMemoryBudget } from "@/supabase/functions/_shared/brain-context";

const task = {
  surface: "content" as const,
  channel: "linkedin",
  contentType: "founder_opinion",
  audience: "mortgage brokers",
  objective: "build trust",
};

test("LinkedIn preferences do not affect Instagram unless explicitly global", () => {
  const scope = { surfaces: ["content"], channels: ["linkedin"] };
  expect(brainMemoryScopeMatches(scope, task)).toBe(true);
  expect(brainMemoryScopeMatches(scope, { ...task, channel: "instagram" })).toBe(false);
  expect(brainMemoryScopeMatches({ global: true }, { ...task, channel: "instagram" })).toBe(true);
});

test("Ask lessons never affect content and legacy Ask vocabulary remains readable", () => {
  expect(brainMemoryScopeMatches({ surfaces: ["ask"] }, task)).toBe(false);
  expect(brainMemoryScopeMatches({ surfaces: ["vault_answer"] }, {
    surface: "ask",
  })).toBe(true);
  expect(normalizeBrainMemoryScope({ surfaces: ["vault_answer"] })).toEqual({
    surfaces: ["ask"],
  });
});

test("topic-specific memory is retrieved only for the relevant task", () => {
  const scope = {
    surfaces: ["content"],
    channels: ["linkedin"],
    contentTypes: ["founder_opinion"],
    audiences: ["mortgage brokers"],
    objectives: ["build trust"],
  };
  expect(brainMemoryScopeMatches(scope, task)).toBe(true);
  expect(brainMemoryScopeMatches(scope, { ...task, contentType: "product_launch" })).toBe(false);
  expect(brainMemoryScopeMatches(scope, { ...task, audience: "home buyers" })).toBe(false);
});

test("scope expansion is sent back for review while narrowing is not", () => {
  const narrow = { surfaces: ["content"], channels: ["linkedin"] };
  expect(isBrainMemoryScopeExpansion(narrow, { surfaces: ["content"] })).toBe(true);
  expect(isBrainMemoryScopeExpansion(
    { surfaces: ["content"] },
    narrow,
  )).toBe(false);
  expect(isBrainMemoryScopeExpansion(narrow, { global: true })).toBe(true);
});

test("strict token budget preserves all hard rules and caps other categories", () => {
  const row = (
    id: string,
    kind: "preference" | "anti_pattern" | "rule",
    pinned = false,
  ) => ({
    id,
    kind,
    content: id,
    confidence: 80,
    pinned,
    scope: { surfaces: ["content" as const] },
    rank_score: 0.8,
  });
  const selected = selectBrainMemoryBudget([
    row("rule-1", "rule"),
    row("rule-2", "rule"),
    ...Array.from({ length: 4 }, (_, index) => row(`pin-${index}`, "preference", true)),
    ...Array.from({ length: 6 }, (_, index) => row(`pref-${index}`, "preference")),
    ...Array.from({ length: 6 }, (_, index) => row(`anti-${index}`, "anti_pattern")),
  ]);
  expect(selected.filter((memory) => memory.kind === "rule")).toHaveLength(2);
  expect(selected.filter((memory) => memory.kind === "preference" && memory.pinned)).toHaveLength(2);
  expect(selected.filter((memory) => memory.kind === "preference" && !memory.pinned)).toHaveLength(3);
  expect(selected.filter((memory) => memory.kind === "anti_pattern")).toHaveLength(3);
});
