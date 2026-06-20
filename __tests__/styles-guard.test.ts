import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Runs the Phase 0 styling guard as part of the test suite so the CI gate
 * fails on any regression: undefined CSS vars, arbitrary hex utilities, new
 * raw-hex / inline-style files, or new arbitrary design values beyond the
 * reviewed baseline.
 */
const script = join(process.cwd(), "scripts/styles-guard.mjs");

describe("styling guard", () => {
  it("passes — token system intact, no new styling violations", () => {
    expect(() => execFileSync("node", [script], { stdio: "pipe" })).not.toThrow();
  });

  // Guards the guard: a fresh component with an arbitrary font-size must fail
  // the ratchet (it's not in the baseline → implied count 0). Run in an isolated
  // copy so the real tree is untouched.
  it("fails when a new file introduces an arbitrary token-bypassing value", () => {
    const dir = mkdtempSync(join(tmpdir(), "styles-guard-"));
    try {
      mkdirSync(join(dir, "app"), { recursive: true });
      mkdirSync(join(dir, "components"), { recursive: true });
      cpSync(join(process.cwd(), "scripts"), join(dir, "scripts"), { recursive: true });
      cpSync(join(process.cwd(), "app/globals.css"), join(dir, "app/globals.css"));
      writeFileSync(join(dir, "components/Bad.tsx"), 'export const Bad = () => <div className="text-[42px] p-[18px]" />;\n');
      expect(() => execFileSync("node", [join(dir, "scripts/styles-guard.mjs")], { cwd: dir, stdio: "pipe" })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
