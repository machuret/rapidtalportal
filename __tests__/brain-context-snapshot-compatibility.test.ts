import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/126_brain_context_snapshot_compatibility.sql"),
  "utf8",
);
const libraryMigration = readFileSync(
  join(process.cwd(), "db/migrations/129_business_library_brain_retrieval.sql"),
  "utf8",
);
const opportunityMigration = readFileSync(
  join(process.cwd(), "db/migrations/130_brain_opportunities.sql"),
  "utf8",
);
const topicsRoute = readFileSync(
  join(process.cwd(), "app/api/content/topics/generate/route.ts"),
  "utf8",
);

describe("Brain context snapshot compatibility", () => {
  test("accepts historical and current resolver versions", () => {
    expect(migration).toContain("'resolver-v1'");
    expect(migration).toContain("'resolver-v2-task-memory'");
    expect(migration).toContain(
      "DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check",
    );
    expect(libraryMigration).toContain("'resolver-v3-business-library'");
    expect(opportunityMigration).toContain("'resolver-v4-library-availability'");
    expect(opportunityMigration).toContain("'diagnostic'");
  });

  test("requires a snapshot before idea generation can continue", () => {
    expect(topicsRoute).toContain("BRAIN_SNAPSHOT_REQUIRED");
    expect(topicsRoute).toContain("No ideas were generated.");
    expect(topicsRoute).not.toContain("brainContextSnapshotId = null");
    expect(topicsRoute).not.toContain(
      "Detailed Brain provenance is temporarily unavailable",
    );
  });
});
