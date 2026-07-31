import {
  BRAIN_CONTEXT_VERSION,
  BRAIN_RESOLVER_VERSION,
  brainContextSchema,
  stableBrainContextJson,
  type BrainContext,
} from "@/lib/brain/context-contract";
import {
  BRAIN_DATA_BOUNDARIES,
  boundaryAllowsSection,
} from "@/lib/brain/data-boundaries";
import {
  brainEvaluationLibrarySchema,
} from "@/lib/brain/evaluation-contract";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const CHUNK_ID = "33333333-3333-4333-8333-333333333333";
const MEMORY_ID = "44444444-4444-4444-8444-444444444444";
const LIBRARY_ENTRY_ID = "55555555-5555-4555-8555-555555555555";
const LIBRARY_VERSION_ID = "66666666-6666-4666-8666-666666666666";
const LIBRARY_CHUNK_ID = "77777777-7777-4777-8777-777777777777";

function context(): BrainContext {
  return {
    version: BRAIN_CONTEXT_VERSION,
    clientId: CLIENT_ID,
    request: {
      surface: "content",
      channel: "linkedin",
      contentType: "founder_opinion",
      topic: "Private credit",
      selectedVaultSourceIds: [ITEM_ID],
      includeMarketIntelligence: false,
    },
    company: {
      fields: { company_name: "Example", target_demographic: "Property investors" },
      companyDnaUpdatedAt: "2026-07-31T01:00:00.000Z",
    },
    knowledge: {
      sources: [{
        itemId: ITEM_ID,
        chunkId: CHUNK_ID,
        title: "Private credit guide",
        excerpt: "A relevant excerpt.",
        category: "reference",
        sourceUrl: null,
        selectionMethod: "selected",
        relevance: 0.91,
        selectionReason: "Explicitly selected and relevant to the requested topic.",
      }],
      retrievalQuery: "Private credit",
      retrievalMethod: "hybrid-v1",
      coverage: "strong",
    },
    library: {
      sources: [{
        entryId: LIBRARY_ENTRY_ID,
        versionId: LIBRARY_VERSION_ID,
        chunkId: LIBRARY_CHUNK_ID,
        versionNumber: 2,
        title: "SEO foundations",
        excerpt: "Use descriptive page titles and match search intent.",
        category: "SEO",
        sourceUrl: null,
        tags: ["seo"],
        selectionMethod: "full_text",
        relevance: 0.84,
        selectionReason: "Published Business Library guidance matched the current task.",
      }],
      retrievalQuery: "Private credit",
      retrievalMethod: "full_text",
      coverage: "weak",
    },
    style: {
      source: "company_channel_style",
      profileId: null,
      profileVersion: null,
      channel: "linkedin",
      confidence: 70,
      resolvedInstructions: ["Use concise paragraphs."],
      hardRules: [{
        id: "no-hype",
        type: "prohibit_phrase",
        value: "guaranteed returns",
        channels: ["linkedin"],
      }],
    },
    memories: [{
      memoryId: MEMORY_ID,
      kind: "preference",
      content: "Prefer direct commercial observations.",
      confidence: 82,
      pinned: false,
      scope: { surfaces: ["content", "linkedin"] },
      relevance: 0.79,
      selectionReason: "Matches the LinkedIn founder-opinion request.",
    }],
    market: {
      included: false,
      snapshotIds: [],
      insights: [],
    },
    warnings: [],
    provenance: {
      resolverVersion: BRAIN_RESOLVER_VERSION,
      generatedAt: "2026-07-31T02:00:00.000Z",
      model: null,
      promptVersion: null,
      companyDnaUpdatedAt: "2026-07-31T01:00:00.000Z",
      styleProfileId: null,
      styleProfileVersion: null,
      vaultItemIds: [ITEM_ID],
      vaultChunkIds: [CHUNK_ID],
      libraryEntryIds: [LIBRARY_ENTRY_ID],
      libraryVersionIds: [LIBRARY_VERSION_ID],
      libraryChunkIds: [LIBRARY_CHUNK_ID],
      memoryIds: [MEMORY_ID],
      marketSnapshotIds: [],
    },
  };
}

describe("Brain Context v1 contract", () => {
  test("accepts a complete structured context and applies request defaults", () => {
    const parsed = brainContextSchema.parse(context());
    expect(parsed.version).toBe("brain-context-v1");
    expect(parsed.request.includeMarketIntelligence).toBe(false);
    expect(parsed.knowledge.sources[0].itemId).toBe(ITEM_ID);
    expect(parsed.library.sources[0].versionId).toBe(LIBRARY_VERSION_ID);
  });

  test("requires provenance to match the exact selected context", () => {
    const invalid = context();
    invalid.provenance.memoryIds = [];
    expect(() => brainContextSchema.parse(invalid)).toThrow(
      "Memory provenance must match the selected lessons.",
    );
  });

  test("never accepts market material when market context is excluded", () => {
    const invalid = context();
    invalid.market.insights = [{
      insightId: "gap-1",
      kind: "positioning_gap",
      summary: "A market gap.",
      competitorIds: [],
      sourceItemIds: [],
      confidence: "medium",
    }];
    expect(() => brainContextSchema.parse(invalid)).toThrow(
      "Excluded market intelligence cannot contain snapshots or insights.",
    );
  });

  test("serializes equivalent objects deterministically for snapshot hashing", () => {
    const first = context();
    const second = {
      ...first,
      company: {
        companyDnaUpdatedAt: first.company.companyDnaUpdatedAt,
        fields: {
          target_demographic: "Property investors",
          company_name: "Example",
        },
      },
    };
    expect(stableBrainContextJson(first)).toBe(stableBrainContextJson(second));
  });

  test("allows several relevant chunks from one Vault item while keeping exact item provenance", () => {
    const additionalChunk = "55555555-5555-4555-8555-555555555555";
    const valid = context();
    valid.knowledge.sources.push({
      ...valid.knowledge.sources[0],
      chunkId: additionalChunk,
      excerpt: "Another relevant excerpt from the same source.",
    });
    valid.provenance.vaultChunkIds.push(additionalChunk);
    expect(brainContextSchema.parse(valid).knowledge.sources).toHaveLength(2);
    expect(brainContextSchema.parse(valid).provenance.vaultItemIds).toEqual([ITEM_ID]);
  });
});

describe("Brain data boundaries", () => {
  test("keeps company knowledge, owned style and market intelligence separate", () => {
    expect(boundaryAllowsSection("company_knowledge", "knowledge")).toBe(true);
    expect(boundaryAllowsSection("company_knowledge", "style")).toBe(false);
    expect(boundaryAllowsSection("owned_style", "style")).toBe(true);
    expect(boundaryAllowsSection("owned_style", "knowledge")).toBe(false);
    expect(boundaryAllowsSection("market_intelligence", "market")).toBe(true);
    expect(boundaryAllowsSection("market_intelligence", "knowledge")).toBe(false);
    expect(boundaryAllowsSection("business_library", "library")).toBe(true);
    expect(BRAIN_DATA_BOUNDARIES.business_library.allowedContextSections).toEqual(["library"]);
    expect(BRAIN_DATA_BOUNDARIES.business_library.prohibitedUses)
      .toContain("company_knowledge");
  });

  test("explicitly excludes published performance from Brain learning", () => {
    expect(BRAIN_DATA_BOUNDARIES.published_performance.prohibitedUses)
      .toContain("brain_learning");
    expect(BRAIN_DATA_BOUNDARIES.published_performance.allowedContextSections)
      .toHaveLength(0);
  });
});

describe("Brain baseline evaluation contract", () => {
  test("captures a versioned current-orchestration baseline", () => {
    const parsed = brainEvaluationLibrarySchema.parse({
      version: 1,
      clientId: CLIENT_ID,
      clientLabel: "Evaluation client",
      capturedAt: "2026-07-31T03:00:00.000Z",
      cases: [{
        version: 1,
        name: "LinkedIn private credit idea",
        caseType: "content_idea",
        channel: "linkedin",
        input: { topic: "Private credit" },
        expected: {
          companyFieldKeys: ["company_name"],
          vaultItemIds: [ITEM_ID],
          memoryIds: [MEMORY_ID],
          styleSource: "company_channel_style",
          marketIncluded: false,
          notes: null,
        },
        baseline: {
          capturedAt: "2026-07-31T03:00:00.000Z",
          model: "current-production-model",
          promptVersion: null,
          output: "Current production output.",
          context: context(),
          contextVersion: BRAIN_CONTEXT_VERSION,
        },
        tags: ["content", "linkedin"],
      }],
    });
    expect(parsed.cases[0].baseline.contextVersion).toBe("brain-context-v1");
  });

  test("rejects duplicate case names within one client library", () => {
    const entry = {
      version: 1,
      name: "Repeated case",
      caseType: "ask",
      channel: null,
      input: { question: "What do we do?" },
      expected: {
        companyFieldKeys: [],
        vaultItemIds: [],
        memoryIds: [],
        styleSource: null,
        marketIncluded: false,
        notes: null,
      },
      baseline: {
        capturedAt: "2026-07-31T03:00:00.000Z",
        model: null,
        promptVersion: null,
        output: "Baseline",
        context: null,
        contextVersion: null,
      },
      tags: [],
    };
    expect(() => brainEvaluationLibrarySchema.parse({
      version: 1,
      clientId: CLIENT_ID,
      clientLabel: "Evaluation client",
      capturedAt: "2026-07-31T03:00:00.000Z",
      cases: [entry, { ...entry }],
    })).toThrow("Evaluation case names must be unique");
  });
});
