import { evaluateCoachQuality, type CoachQualityInput } from "@/lib/brain/coach-quality-gate";

const SNAPSHOT = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const base: CoachQualityInput = {
  role: "client_admin",
  answer: "Here is the recommended next step.",
  snapshotId: SNAPSHOT,
  libraryAvailability: "available",
  warningCodes: [],
  sources: [{ kind: "library", versionId: VERSION, versionNumber: 3 }],
  action: null,
};

describe("Coach Phase 4 role and evidence quality gate", () => {
  test.each([
    ["grounded client advice", {}, true, null],
    ["missing snapshot", { snapshotId: null }, false, "snapshot_required"],
    ["unversioned Library claim", { sources: [{ kind: "library" }] }, false, "library_provenance_required"],
    ["visible Library recovery", { libraryAvailability: "unavailable", warningCodes: ["business_library_unavailable"], sources: [] }, true, null],
    ["hidden Library failure", { libraryAvailability: "unavailable", sources: [] }, false, "library_failure_hidden"],
    ["VA cannot approve", { role: "va", action: { type: "review_task" } }, false, "client_review_only"],
    ["Client cannot submit VA work", { action: { type: "submit_review" } }, false, "va_submit_only"],
    ["VA can remember private context", { role: "va", action: { type: "create_memory" } }, true, null],
    ["no imaginary completed action", { answer: "I've sent that to your VA.", action: null }, false, "unconfirmed_action_claim"],
    ["cross-company evidence", { expectedClientId: SNAPSHOT, sources: [{ kind: "vault", clientId: VERSION }] }, false, "cross_company_source"],
    ["unsupported claim", { claims: [{ support: "none" }] }, false, "unsupported_claim"],
    ["generic guidance overrides company truth", { claims: [{ support: "library", conflictsWithCompany: true }] }, false, "company_truth_overridden"],
    ["missing citation", { claims: [{ support: "company", citationComplete: false }] }, false, "citation_incomplete"],
    ["wrong role answer", { answerRoleAligned: false }, false, "role_answer_mismatch"],
    ["private content leaked", { privateContentExposed: true }, false, "private_content_exposed"],
  ] as const)("evaluates %s", (_name, override, passed, issue) => {
    const result = evaluateCoachQuality({ ...base, ...override } as CoachQualityInput);
    expect(result.passed).toBe(passed);
    if (issue) expect(result.issues.map((item) => item.code)).toContain(issue);
  });
});
