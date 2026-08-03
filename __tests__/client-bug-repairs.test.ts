import { readFileSync } from "node:fs";
import { join } from "node:path";
import { awaitingApprovalCount } from "@/lib/dashboard/approval-count";
import { contentProjectProgress } from "@/lib/content/project-progress";
import { ROUTES } from "@/lib/api/routes";

describe("client experience bug repairs", () => {
  test("approval totals include both task and content approvals", () => {
    expect(awaitingApprovalCount(2, 3)).toBe(5);
  });

  test("content projects expose their actual workflow state", () => {
    const base = { status: "active", last_error_message: null, last_operation: null } as const;
    expect(contentProjectProgress({ ...base, current_step: "brief" })).toBe("Brief in progress");
    expect(contentProjectProgress({ ...base, current_step: "evidence" })).toBe("Choosing sources");
    expect(contentProjectProgress({ ...base, current_step: "generate" })).toBe("Ready to generate");
  });

  test("lead URLs can select one campaign without losing the other filters", () => {
    const url = ROUTES.prospecting.leadsPage("client", "new", "strong", "fit", 30, 30, "campaign");
    expect(url).toContain("status=new");
    expect(url).toContain("campaignId=campaign");
  });

  test("CRM handoff is recorded atomically in the migration", () => {
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/20260804000100_client_bug_repairs.sql"),
      "utf8",
    );
    expect(migration).toContain("INSERT INTO crm_events");
    expect(migration).toContain("added this contact from Lead Generation");
  });

  test("approval, Vault indexing and Notebook failures are explicit", () => {
    const editor = readFileSync(join(process.cwd(), "components/content/library/PieceDetailEditor.tsx"), "utf8");
    const vaultRow = readFileSync(join(process.cwd(), "components/vault/VaultItemRow.tsx"), "utf8");
    const notebook = readFileSync(join(process.cwd(), "app/(portal)/notebook/page.tsx"), "utf8");
    expect(editor).toContain("liveWarningCount > 0");
    expect(editor).toContain("Approval is blocked until");
    expect(vaultRow).toContain("Awaiting AI search");
    expect(notebook).toContain("withPortalDataTimeout");
    expect(notebook).toContain("Notebook pages could not be loaded");
  });
});
