/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("migration 144 — multi-table trigger field validation fix", () => {
  const migration = read("db/migrations/144_fix_multi_table_trigger_field_validation.sql");

  it("nests brain_memory-only fields inside their own branch", () => {
    // The outer chain must open the brain_memory branch on TG_TABLE_NAME alone;
    // NEW.active / NEW.contradiction_status may only appear in nested statements,
    // because PL/pgSQL validates record fields at plan time, not at branch time.
    const fnBody = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(fnBody).toContain("ELSIF TG_TABLE_NAME = 'brain_memory' THEN");
    const outerChain = fnBody.split("ELSIF TG_TABLE_NAME = 'brain_memory' THEN")[0];
    expect(outerChain).not.toContain("NEW.active");
    expect(outerChain).not.toContain("NEW.contradiction_status");
    expect(fnBody).toContain("IF NEW.status = 'active' AND NEW.active = true");
    expect(fnBody).toContain("ELSIF NEW.contradiction_status = 'open'");
  });

  it("preserves every journal event type from the original function", () => {
    for (const eventType of ["style_approved", "memory_approved", "memory_conflict", "gap_resolved", "market_refreshed", "sources_usable"]) {
      expect(migration).toContain(`'${eventType}'`);
    }
  });

  it("self-records in the migrations ledger", () => {
    expect(migration).toContain("INSERT INTO schema_migrations (version)");
    expect(migration).toContain("144_fix_multi_table_trigger_field_validation.sql");
  });
});
