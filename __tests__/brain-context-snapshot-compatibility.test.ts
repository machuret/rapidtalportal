import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/126_brain_context_snapshot_compatibility.sql"),
  "utf8",
);
const topicsRoute = readFileSync(
  join(process.cwd(), "app/api/content/topics/generate/route.ts"),
  "utf8",
);

describe("Brain context snapshot compatibility", () => {
  test("accepts both the original and task-aware resolver versions", () => {
    expect(migration).toContain("'resolver-v1'");
    expect(migration).toContain("'resolver-v2-task-memory'");
    expect(migration).toContain(
      "DROP CONSTRAINT IF EXISTS brain_context_snapshots_resolver_version_check",
    );
  });

  test("never blocks idea generation when optional provenance persistence fails", () => {
    const failureBlock = topicsRoute.slice(
      topicsRoute.indexOf("[topics/generate] Brain context snapshot failed"),
      topicsRoute.indexOf("} else {", topicsRoute.indexOf(
        "[topics/generate] Brain context snapshot failed",
      )),
    );
    expect(failureBlock).toContain("brainContextSnapshotId = null");
    expect(failureBlock).not.toContain("return NextResponse");
    expect(topicsRoute).toContain(
      "Detailed Brain provenance is temporarily unavailable; the ideas remain fully saveable.",
    );
  });
});
