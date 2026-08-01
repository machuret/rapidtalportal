import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Coach Phase 3/4 release quality repairs", () => {
  it("expires raw private feedback while preserving explicit durable memory", () => {
    const migration = read("db/migrations/141_coach_release_quality_repairs.sql");
    const resolver = read("supabase/functions/_shared/brain-context.ts");
    expect(migration).toContain("brain_signals_private_retention");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("DELETE FROM brain_signals WHERE visibility = 'private_coach'");
    expect(migration).not.toContain("DELETE FROM coach_memories");
    expect(resolver).toContain('.gt("retention_until", generatedAt)');
  });

  it("turns scheduled commitments into timezone-aware weekly follow-up loops", () => {
    const migration = read("db/migrations/141_coach_release_quality_repairs.sql");
    expect(migration).toContain("check_in_interval_days = 7");
    expect(migration).toContain("AT TIME ZONE v_timezone");
    expect(migration).toContain("next_check_in_at = v_next_check_in_at");
    expect(migration).toContain("'nextCheckInAt', v_next_check_in_at");
  });

  it("does not report a partial or failed semantic index as complete", () => {
    const publish = read("app/api/admin/library/[id]/action/route.ts");
    const indexer = read("supabase/functions/business-library-index/index.ts");
    expect(publish).toContain("indexResult.failed");
    expect(publish).toContain('indexing = !indexResponse.ok');
    expect(publish).toContain('? "incomplete"');
    expect(indexer).toContain("failed === 0 && remainingCount === 0");
  });

  it("makes unindexed semantic retrieval visibly degraded and retryable", () => {
    const migration = read("db/migrations/141_coach_release_quality_repairs.sql");
    const resolver = read("supabase/functions/_shared/brain-context.ts");
    expect(migration).toContain("'full_text_unindexed'");
    expect(resolver).toContain('row.retrieval_method === "full_text_unindexed"');
    expect(resolver).toContain("semanticIndexIncomplete");
    expect(resolver).toContain("indexing can be retried");
  });

  it("enforces the deterministic role and evidence gate before persisting a turn", () => {
    const route = read("app/api/coach/threads/route.ts");
    const gate = read("lib/brain/coach-quality-gate.ts");
    expect(route).toContain("evaluateCoachQuality");
    expect(route).toContain("qualityIssues");
    expect(gate).toContain("cross_company_source");
    expect(gate).toContain("company_truth_overridden");
    expect(gate).toContain("citation_incomplete");
    expect(gate).toContain("private_content_exposed");
  });
});
