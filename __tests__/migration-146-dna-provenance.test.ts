/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("migration 146 — company_dna field provenance", () => {
  const migration = read("db/migrations/146_company_dna_field_provenance.sql");
  const route = read("app/api/company-dna/route.ts");
  const form = read("components/dna/DnaForm.tsx");

  it("adds the provenance column and self-records", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS field_provenance JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("INSERT INTO schema_migrations (version)");
    expect(migration).toContain("146_company_dna_field_provenance.sql");
  });

  it("the save route accepts provenance entries", () => {
    expect(route).toContain("field_provenance:");
    expect(route).toContain('source: z.enum(["scrape", "vault_draft"])');
  });

  it("the form marks auto-fills and clears provenance on manual edit", () => {
    expect(form).toContain('markProvenance(appliedKeys, "vault_draft")');
    expect(form).toContain('"scrape"');
    expect(form).toContain("delete rest[key as string]");
    expect(form).toContain("ProvenanceBadge");
  });

  it("groups the profile into facts and voice sections", () => {
    expect(form).toContain("The facts");
    expect(form).toContain("Voice &amp; editorial policy");
    expect(form).toContain("FACT_FIELDS");
    expect(form).toContain("VOICE_FIELDS");
  });
});
