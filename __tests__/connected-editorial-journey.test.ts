/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";
import {
  contentBriefSchema,
  contentMarketIntelligenceSchema,
  contentProjectIdeaSchema,
  contentProjectStatusSchema,
  contentProjectStepSchema,
} from "@/lib/content/project-schema";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("connected editorial journey", () => {
  const migration = read("db/migrations/105_connected_editorial_projects.sql");
  const projectsRoute = read("app/api/content/projects/route.ts");
  const evidenceRoute = read("app/api/content/projects/evidence/route.ts");
  const validationRoute = read("app/api/content/validate/route.ts");
  const generator = read("supabase/functions/content-generate/index.ts");
  const retrieval = read("supabase/functions/_shared/content-vault-retrieval.ts");
  const studio = read("components/content/ContentStudio.tsx");
  const workflow = read("components/content/ContentProjectWorkflow.tsx");
  const revisions = read("db/migrations/092_unified_content_workspace.sql");

  test("one durable tenant-scoped project connects the complete journey", () => {
    expect(migration).toContain("CREATE TABLE content_projects");
    expect(migration).toContain("idea_snapshot JSONB");
    expect(migration).toContain("content_brief JSONB");
    expect(migration).toContain("vault_source_ids UUID[]");
    expect(migration).toContain("competitor_signals JSONB");
    expect(migration).toContain("style_snapshot JSONB");
    expect(migration).toContain("current_piece_id UUID");
    expect(migration).toContain("FOREIGN KEY (project_id, client_id)");
    expect(migration).toContain("ALTER TABLE content_projects ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("client_id = current_user_client_id()");
  });

  test("draft creation and project progression commit atomically", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION create_content_project_draft");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("p_content_brief IS DISTINCT FROM v_project.content_brief");
    expect(migration).toContain("v_item_id = ANY(v_project.vault_source_ids)");
    expect(migration).toContain("INSERT INTO content_pieces");
    expect(migration).toContain("UPDATE content_projects");
    expect(generator).toContain('rpc("create_content_project_draft"');
    expect(generator).toContain("selectedVaultSourceIds");
    expect(generator).toContain("The selected Vault evidence changed.");
  });

  test("factual, stylistic and competitor inputs remain separate", () => {
    expect(evidenceRoute).toContain('.eq("evidence_role", "factual")');
    expect(retrieval).toContain("selectedSourceIds");
    expect(retrieval).toContain("selectedSet.has(item.id)");
    expect(workflow).toContain("Facts from the company Vault");
    expect(workflow).toContain("Style from owned examples");
    expect(workflow).toContain("Market inspiration");
    expect(workflow).toContain("They can never substantiate company claims.");
    expect(projectsRoute).toContain("verifyMarketIntelligence");
    expect(projectsRoute).toContain("capture_version_id");
    expect(projectsRoute).toContain("content_hash");
  });

  test("the primary Studio navigation supports discovery and recovery", () => {
    expect(studio).toContain("Continue working");
    expect(studio).toContain("Company priorities &amp; Vault gaps");
    expect(studio).toContain("Competitor opportunities");
    expect(studio).toContain("Drafts &amp; approved library");
    expect(studio).toContain("openProject");
    expect(workflow).toContain("Project saved · recoverable on any device");
    for (const step of ["Idea", "Brief", "Evidence", "Generate", "Edit", "Validate", "Approve"]) {
      expect(workflow).toContain(`label: "${step}"`);
    }
  });

  test("ideas support every declared decision before promotion", () => {
    expect(workflow).toContain("Promote into a brief");
    expect(workflow).toContain("Save idea for later");
    expect(workflow).toContain("Regenerate ideas");
    expect(workflow).toContain("Reject idea");
    expect(contentProjectStatusSchema.parse("saved")).toBe("saved");
    expect(contentProjectStatusSchema.parse("rejected")).toBe("rejected");
    expect(contentProjectStepSchema.parse("brief")).toBe("brief");
    expect(contentProjectStepSchema.safeParse("unknown").success).toBe(false);
    const explainableIdea = contentProjectIdeaSchema.parse({
      version: 1,
      origin: "company_topic",
      title: "A fully explainable idea",
      channel: "linkedin",
      rationale: "Useful to the audience.",
      differentiation: "A new company angle.",
      evidenceSummary: "One Vault source.",
      explainability: {
        hook: "A concrete hook",
        topic: "A practical topic",
        intendedAudience: "Business owners",
        strategicObjective: "Build informed consideration",
        whyValuable: "It answers a recurring audience question.",
        companyDnaFit: "It reflects the company’s evidence-led positioning.",
        supportingVaultMaterial: [{
          itemId: "77777777-7777-4777-8777-777777777777",
          title: "Approved company guide",
        }],
        supportingMarketSignals: [],
        differenceFromCompetitors: "No competitor comparison requested.",
        existingCompanyContent: [],
        differenceFromExisting: "No equivalent company artifact exists.",
        recommendedFormat: "LinkedIn point-of-view post",
        recommendedCta: "Read the company guide",
        confidence: "high",
        evidenceStrength: "medium",
        scores: Object.fromEntries([
          "companyRelevance", "audienceRelevance", "vaultEvidenceStrength",
          "marketOpportunity", "differentiation", "novelty", "channelFit",
        ].map((key) => [key, { score: 80, explanation: `${key} is supported.` }])),
      },
    });
    expect(explainableIdea.explainability?.scores.novelty.score).toBe(80);
  });

  test("brief and market provenance schemas reject ambiguous inputs", () => {
    expect(contentBriefSchema.parse({
      version: 1,
      objective: "Explain the company position",
      audience: "Prospective clients",
      angle: "A company-specific perspective",
      desiredFormat: "Founder-led insight post",
      keyPoints: ["One verified point"],
      callToAction: "Read the guide",
      tone: "professional",
      length: "medium",
      mode: "new",
    })).toMatchObject({
      objective: "Explain the company position",
      desiredFormat: "Founder-led insight post",
    });

    const duplicateId = "11111111-1111-4111-8111-111111111111";
    expect(contentMarketIntelligenceSchema.safeParse({
      version: 1,
      runId: "22222222-2222-4222-8222-222222222222",
      reportSchemaVersion: 2,
      ideaTitle: "A verified opportunity",
      whyValuable: "The market evidence shows a useful, timely audience need.",
      differentiation: "The company can answer it with a specific evidence-led angle.",
      confidence: "high",
      novelty: "new",
      competitorIds: [duplicateId, duplicateId],
      competitorSources: [
        {
          itemId: "33333333-3333-4333-8333-333333333333",
          captureVersionId: "44444444-4444-4444-8444-444444444444",
          contentHash: "1234567890abcdef",
          competitorId: duplicateId,
          competitorName: "Competitor",
          title: "Post one",
          url: "https://example.com/post-one",
          effectiveAt: "2026-07-30T00:00:00+00:00",
          dateBasis: "published",
          evidenceQuote: "A sufficiently long evidence quotation.",
        },
        {
          itemId: "55555555-5555-4555-8555-555555555555",
          captureVersionId: "66666666-6666-4666-8666-666666666666",
          contentHash: "abcdef1234567890",
          competitorId: duplicateId,
          competitorName: "Competitor",
          title: "Post two",
          url: "https://example.com/post-two",
          effectiveAt: "2026-07-30T00:00:00+00:00",
          dateBasis: "captured",
          evidenceQuote: "Another sufficiently long evidence quotation.",
        },
      ],
      companyReferences: [],
      generatedAt: "2026-07-30T00:00:00+00:00",
    }).success).toBe(false);
  });

  test("validation and revisions retain provenance through approval", () => {
    expect(validationRoute).toContain('id: "claims"');
    expect(validationRoute).toContain('id: "style"');
    expect(validationRoute).toContain('id: "platform"');
    expect(validationRoute).toContain('id: "hard_rules"');
    expect(revisions).toContain("OLD.content_brief, OLD.style_snapshot, OLD.source_references");
    expect(migration).toContain("NEW.style_snapshot IS NOT DISTINCT FROM OLD.style_snapshot");
    expect(migration).toContain("NEW.source_references IS NOT DISTINCT FROM OLD.source_references");
    expect(migration).toContain("'provenance_refresh'");
    expect(migration).toContain("CREATE TRIGGER content_pieces_sync_project");
    expect(migration).toContain("WHEN NEW.status = 'approved' THEN 'approved'");
    expect(workflow).toContain("The brief, evidence, style, draft and revision history remain connected");
  });
});
