import { readFileSync } from "node:fs";
import { join } from "node:path";

const askUi = readFileSync(
  join(process.cwd(), "components/vault/AskVaultClient.tsx"),
  "utf8",
);
const flow = readFileSync(
  join(process.cwd(), "components/intelligence/AskBrainFlow.tsx"),
  "utf8",
);
const motion = readFileSync(
  join(process.cwd(), "components/intelligence/IntelligenceMotion.module.css"),
  "utf8",
);
const resolver = readFileSync(
  join(process.cwd(), "supabase/functions/_shared/brain-context.ts"),
  "utf8",
);
const askEngine = readFileSync(
  join(process.cwd(), "supabase/functions/vault-ask/index.ts"),
  "utf8",
);

describe("Brain Phase 6 quality gate", () => {
  test("keeps tenant company evidence isolated and snapshots every Ask answer", () => {
    expect(resolver).toContain('.eq("client_id", clientId)');
    expect(askEngine).toContain("persistBrainContextSnapshot({");
    expect(askEngine).toContain('artifactKind: "vault_answer"');
    expect(askEngine).not.toContain("brainContextSurfaceEnabled");
  });

  test("shows versioned Library citations and visible recoverable failures", () => {
    expect(askUi).toContain("Version {s.versionNumber}");
    expect(askUi).toContain("Library temporarily unavailable");
    expect(askUi).toContain("Retry with Library");
    expect(askUi).toContain("brainContextSnapshotId");
    expect(askEngine).toContain("versionId: b.versionId");
    expect(askEngine).toContain("X-Brain-Library-Availability");
  });

  test("places company facts ahead of generic guidance inside the model context", () => {
    const vaultPosition = askEngine.indexOf('blocks.filter((b) => b.kind === "vault")');
    const libraryPosition = askEngine.indexOf('blocks.filter((b) => b.kind === "library")');
    expect(vaultPosition).toBeGreaterThan(0);
    expect(libraryPosition).toBeGreaterThan(vaultPosition);
    expect(askEngine).toContain("company-specific source wins");
  });

  test("animates only layers that were actually queried", () => {
    expect(flow).toContain("const isChecking = working && queried.has(source.kind)");
    expect(flow).toContain("{isChecking && <span");
    expect(flow).not.toContain("active.has(source.kind) || working");
    expect(motion).toContain(".working .pathActive");
    expect(motion).toContain("animation: messageTravel 2.6s ease-in-out 1");
  });

  test("supports reduced motion and mobile layouts", () => {
    expect(motion).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motion).toContain("animation: none");
    expect(motion).toContain("@media (max-width: 600px)");
    expect(motion).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
});
