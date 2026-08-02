import { readFileSync } from "node:fs";
import { join } from "node:path";

const askUi = [
  "components/coach/AskVaultClient.tsx",
  "components/coach/ChatTurn.tsx",
  "components/coach/ActionDraftForms.tsx",
  "components/coach/useCoachChat.ts",
]
  .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
  .join("\n");
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
const conversationPulse = readFileSync(
  join(process.cwd(), "components/intelligence/ConversationPulse.tsx"),
  "utf8",
);
const messagesClient = readFileSync(
  join(process.cwd(), "components/messages/MessagesClient.tsx"),
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
    expect(askUi).toContain("Version {source.versionNumber}");
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
    expect(askEngine).toContain("NON-OVERRIDABLE BRAIN EVIDENCE POLICY");
    expect(askEngine).toContain("`${editablePrompt}\\n\\n${MANDATORY_BRAIN_POLICY}\\n\\n${coachRolePolicy(coachRole, requestedCoachMode)}`");
  });

  test("animates only layers that were actually queried", () => {
    expect(flow).toContain("const isChecking = working && queried.has(source.kind)");
    expect(flow).toContain("{isChecking && <span");
    expect(flow).not.toContain("active.has(source.kind) || working");
    expect(motion).toContain(".working .pathActive");
    expect(motion).toContain("animation: messageTravel 2.6s ease-in-out 1");
    expect(conversationPulse).toContain("messageCount > 0 && activityActive");
    expect(messagesClient).toContain("latestMessage?.id !== initialMessageId");
  });

  test("cites only evidence supplied to each exact answer", () => {
    expect(askEngine).toContain("buildGroundedContext(ranked, MAX_CONTEXT)");
    expect(askEngine).toContain("grounded.included.map");
    expect(askEngine).not.toContain("context = context.slice(0, MAX_CONTEXT)");
    expect(askUi).toContain("Citations for the deeper answer");
    expect(askUi).toContain("snapshotId={deepEvidence.brainContextSnapshotId}");
  });

  test("supports reduced motion and mobile layouts", () => {
    expect(motion).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motion).toContain("animation: none");
    expect(motion).toContain("@media (max-width: 600px)");
    expect(motion).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
});
