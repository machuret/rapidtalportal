import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Runs the Phase 0 styling guard as part of the test suite so the CI gate
 * fails on any regression: undefined CSS vars, arbitrary hex utilities, or new
 * raw-hex / inline-style files beyond the reviewed baseline.
 */
describe("styling guard", () => {
  it("passes — token system intact, no new styling violations", () => {
    const script = join(process.cwd(), "scripts/styles-guard.mjs");
    expect(() => execFileSync("node", [script], { stdio: "pipe" })).not.toThrow();
  });
});
