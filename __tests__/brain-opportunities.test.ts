import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diagnosticCandidates } from "@/lib/brain/opportunities";
import type { BrainContext } from "@/lib/brain/context-contract";
import type { BrainReadiness } from "@/lib/brain/readiness";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/130_brain_opportunities.sql"),
  "utf8",
);
const outcomeIntegrityMigration = readFileSync(
  join(process.cwd(), "db/migrations/131_brain_opportunity_outcome_integrity.sql"),
  "utf8",
);
const cron = readFileSync(
  join(process.cwd(), "app/api/cron/brain-opportunities/route.ts"),
  "utf8",
);
const actionRoute = readFileSync(
  join(process.cwd(), "app/api/brain/opportunities/[id]/route.ts"),
  "utf8",
);
const opportunityEngine = readFileSync(
  join(process.cwd(), "lib/brain/opportunities.ts"),
  "utf8",
);
const opportunityUi = readFileSync(
  join(process.cwd(), "components/brain/BrainOpportunities.tsx"),
  "utf8",
);
const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");

const VERSION_ID = "11111111-1111-4111-8111-111111111111";

function readiness(): BrainReadiness {
  return {
    label: "Brain Readiness",
    overallStatus: "developing",
    dimensions: [{
      key: "knowledge",
      label: "Knowledge readiness",
      score: 35,
      status: "limited",
      summary: "Three company sources are usable.",
      evidence: ["Two unresolved knowledge gaps"],
      actions: ["Resolve the highest-impact knowledge gap."],
    }],
    contextual: {
      channel: null,
      channelReadiness: "developing",
      voiceConfidence: "low",
      vaultCoverage: "weak",
      relevantLessons: 0,
      marketUpdatedAt: null,
    },
    measuredAt: "2026-07-31T00:00:00.000Z",
  };
}

function context(availability: BrainContext["library"]["availability"]): BrainContext {
  return {
    company: { fields: { company_name: "Example Co" } },
    knowledge: { sources: [{ itemId: "vault-source" }] },
    memories: [],
    market: { included: false, insights: [] },
    library: {
      availability,
      coverage: availability === "unavailable" ? "none" : "weak",
      retrievalMethod: availability === "unavailable" ? "none" : "full_text",
      retrievalQuery: "business growth",
      sources: availability === "unavailable" ? [] : [{
        entryId: "22222222-2222-4222-8222-222222222222",
        versionId: VERSION_ID,
        chunkId: "33333333-3333-4333-8333-333333333333",
        versionNumber: 3,
        title: "SEO foundations",
        excerpt: "Match one useful page to one clear search intent.",
        category: "SEO",
        sourceUrl: null,
        tags: ["seo"],
        selectionMethod: "full_text",
        relevance: 0.8,
        selectionReason: "Relevant published guidance.",
      }],
    },
  } as unknown as BrainContext;
}

describe("proactive Brain opportunities", () => {
  test("creates readiness opportunities and versioned Library suggestions", () => {
    const candidates = diagnosticCandidates(readiness(), context("available"));
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "knowledge_gap",
        sourceLayers: expect.arrayContaining(["company_dna", "vault"]),
      }),
      expect.objectContaining({
        kind: "growth",
        sourceLayers: expect.arrayContaining(["library"]),
        libraryProvenance: [expect.objectContaining({
          versionId: VERSION_ID,
          versionNumber: 3,
        })],
      }),
    ]));
    expect(candidates.find((candidate) => candidate.kind === "growth")?.rationale)
      .toContain("general guidance, not a statement about current company practice");
  });

  test("does not invent a Library opportunity when retrieval is unavailable", () => {
    const candidates = diagnosticCandidates(readiness(), context("unavailable"));
    expect(candidates.some((candidate) => candidate.sourceLayers.includes("library"))).toBe(false);
  });

  test("reports only source layers that were actually present", () => {
    const thinContext = {
      ...context("available"),
      company: { fields: {} },
      knowledge: { sources: [] },
      memories: [],
      market: { included: false, insights: [] },
    } as unknown as BrainContext;
    const candidates = diagnosticCandidates(readiness(), thinContext);
    expect(candidates.find((candidate) => candidate.kind === "knowledge_gap")?.sourceLayers)
      .toEqual(["runtime"]);
    expect(candidates.find((candidate) => candidate.kind === "growth")?.sourceLayers)
      .toEqual(["library"]);
    expect(candidates.find((candidate) => candidate.kind === "growth")?.rationale)
      .toContain("requires owner verification");
  });

  test("requires immutable snapshots, tenant scope and approval transitions", () => {
    expect(migration).toContain("brain_context_snapshot_id UUID NOT NULL");
    expect(migration).toContain("REFERENCES brain_context_snapshots(id, client_id) ON DELETE RESTRICT");
    expect(migration).toContain("REFERENCES brain_diagnostic_runs(id, client_id) ON DELETE CASCADE");
    expect(migration).toContain("REFERENCES brain_opportunities(id, client_id) ON DELETE CASCADE");
    expect(migration).toContain("jsonb_array_length(library_provenance)");
    expect(migration).toContain("brain_opportunities_open_fingerprint");
    expect(migration).toContain("transition_brain_opportunity");
    expect(migration).toContain("Invalid opportunity transition");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(actionRoute).toContain("assertClientAccess");
    expect(actionRoute).toContain("p_client_id: parsed.data.clientId");
    expect(opportunityEngine).toContain("brain_diagnostic_timed_out");
    expect(opportunityEngine).toContain("recoverable: true");
    expect(opportunityEngine).toContain('.from("brain_opportunities")');
    expect(opportunityEngine).toContain(".delete()");
    expect(opportunityUi).toContain("Opportunities temporarily unavailable");
    expect(opportunityUi).toContain("Retry the load");
  });

  test("runs diagnostics on a bounded weekly schedule", () => {
    expect(vercel).toContain("/api/cron/brain-opportunities");
    expect(cron).toContain("MAX_CLIENTS_PER_RUN = 10");
    expect(cron).toContain("DIAGNOSTIC_INTERVAL_MS = 7");
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain('.order("id", { ascending: true })');
  });

  test("preserves completion evidence when effectiveness is measured later", () => {
    expect(outcomeIntegrityMigration).toContain(
      "current_row.outcome || coalesce(p_outcome, '{}'::JSONB)",
    );
    expect(outcomeIntegrityMigration).toContain("event_name := 'measured'");
    expect(outcomeIntegrityMigration).toContain("FROM PUBLIC, anon, authenticated");
  });
});
