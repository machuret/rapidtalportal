import fs from "node:fs";
import path from "node:path";
import { readinessStatus } from "@/lib/brain/readiness";

const migration = fs.readFileSync(
  path.join(process.cwd(), "db/migrations/124_brain_readiness_product.sql"),
  "utf8",
);
const cron = fs.readFileSync(
  path.join(process.cwd(), "app/api/cron/brain-distill/route.ts"),
  "utf8",
);

describe("Phase 4 Brain readiness product", () => {
  it("uses transparent capability bands instead of genius levels", () => {
    expect(readinessStatus(91)).toBe("strong");
    expect(readinessStatus(79)).toBe("developing");
    expect(readinessStatus(54)).toBe("limited");
    expect(readinessStatus(24)).toBe("not_ready");
    expect(migration).not.toContain("'Genius'");
    expect(cron).not.toContain("computeBrainScore");
    expect(cron).not.toContain("brain_score_history");
    expect(cron).toContain("brain_maintenance_state");
  });

  it("stores grouped, owned and resolvable knowledge gaps", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS brain_knowledge_gaps");
    expect(migration).toContain("UNIQUE (client_id, normalized_topic)");
    expect(migration).toContain("example_questions TEXT[]");
    expect(migration).toContain("occurrence_count INTEGER");
    expect(migration).toContain("resolved_by_vault_item_id");
    expect(migration).toContain("affected_surfaces");
    expect(migration).toContain("left(coalesce(");
  });

  it("links exact unanswered queries to their managed gap", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS brain_gap_id");
    expect(migration).toContain("sync_brain_knowledge_gap_from_query");
    expect(migration).toContain("brain_knowledge_gaps.occurrence_count + 1");
  });

  it("keeps managed gap mutation service-only and tenant scoped", () => {
    expect(migration).toContain("ALTER TABLE brain_knowledge_gaps ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE brain_knowledge_gaps FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("client_id = current_user_client_id()");
  });

  it("records only explicit capability-changing event types in the new timeline", () => {
    for (const event of [
      "style_approved",
      "memory_approved",
      "memory_conflict",
      "gap_resolved",
      "market_refreshed",
      "sources_usable",
    ]) {
      expect(migration).toContain(`'${event}'`);
    }
    expect(migration).toContain("meaningful BOOLEAN NOT NULL DEFAULT false");
    expect(migration).toContain("WHERE meaningful = true");
  });
});
