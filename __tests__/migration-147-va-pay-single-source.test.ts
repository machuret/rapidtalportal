/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("migration 147 — va_job_contracts is the single source of truth for VA pay", () => {
  const migration = read("db/migrations/147_va_pay_single_source_of_truth.sql");
  const manifest = read("lib/migrations/manifest.ts");
  const profileEditor = read("components/team/VaProfileEditor.tsx");
  const teamRoute = read("app/api/team/[id]/route.ts");
  const teamPage = read("app/(portal)/team/[id]/page.tsx");

  it("backfills contracts from legacy users pay columns only when no contract exists", () => {
    expect(migration).toContain("INSERT INTO va_job_contracts (user_id, client_id, rate, currency, pay_period, payment_method)");
    expect(migration).toContain("FROM users u");
    expect(migration).toContain("u.salary IS NOT NULL OR u.payment_terms IS NOT NULL OR u.payment_details IS NOT NULL");
    // The guard that limits the backfill to users without a contract row.
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("SELECT 1 FROM va_job_contracts c WHERE c.user_id = u.id");
  });

  it("never overwrites existing contract rows", () => {
    expect(migration).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(migration).not.toContain("DO UPDATE");
    expect(migration).not.toContain("UPDATE va_job_contracts");
  });

  it("maps payment_terms to payment_method only on a clean parse, else NULL", () => {
    expect(migration).toContain("CASE lower(btrim(u.payment_terms))");
    for (const method of ["'bank'", "'wise'", "'paypal'"]) {
      expect(migration).toContain(`WHEN ${method}`);
    }
    expect(migration).toContain("ELSE NULL");
  });

  it("documents the legacy columns as deprecated but keeps them (no drop)", () => {
    expect(migration).toContain("DEPRECATED");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("self-records in the migrations ledger", () => {
    expect(migration).toContain("INSERT INTO schema_migrations (version)");
    expect(migration).toContain("147_va_pay_single_source_of_truth.sql");
  });

  it("is listed in the migration manifest", () => {
    expect(manifest).toContain('"147_va_pay_single_source_of_truth.sql"');
  });

  it("app code no longer writes the legacy pay fields", () => {
    // The profile editor lost its Compensation section — pay is edited via
    // VaContractEditor. (Deprecation comments may still name the columns, so
    // assert on usage patterns, not bare substrings.)
    expect(profileEditor).not.toContain("form.salary");
    expect(profileEditor).not.toContain("form.payment_terms");
    expect(profileEditor).not.toContain("form.payment_details");
    expect(profileEditor).not.toContain("salary:");
    expect(profileEditor).not.toContain("payment_terms:");
    expect(profileEditor).not.toContain("payment_details:");
    // The team PATCH route dropped the pay fields from its schema.
    expect(teamRoute).not.toContain("salary:");
    expect(teamRoute).not.toContain("payment_terms:");
    expect(teamRoute).not.toContain("payment_details:");
  });

  it("the team detail compensation card renders contract-first with a marked legacy fallback", () => {
    expect(teamPage).toContain("(legacy)");
    // Contract values win when a contract row exists; legacy fields only render
    // in the fallback branch.
    expect(teamPage).toContain("const useLegacyPay = !contract");
  });
});
