import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Coach follow-up quality", () => {
  test("removes terminal punctuation before adding the checklist question mark", () => {
    const edge = readFileSync(
      join(process.cwd(), "supabase/functions/vault-ask/index.ts"),
      "utf8",
    );
    expect(edge).toContain('replace(/[\\s?.!]+$/u, "")');
    expect(edge).toContain("practical checklist for ${checklistTopic}?");
    expect(edge).not.toContain("practical checklist for ${question.slice(0, 80)}?");
  });
});
