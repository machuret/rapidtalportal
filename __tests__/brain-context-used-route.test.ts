/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { GET } from "@/app/api/brain/context-used/route";
import {
  BRAIN_CONTEXT_VERSION,
  BRAIN_RESOLVER_VERSION,
  type BrainContext,
} from "@/lib/brain/context-contract";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const MEMORY_ID = "55555555-5555-4555-8555-555555555555";
const LIBRARY_ENTRY_ID = "66666666-6666-4666-8666-666666666666";
const LIBRARY_VERSION_ID = "77777777-7777-4777-8777-777777777777";
const routeCtx = { params: Promise.resolve({}) };

function snapshot(): BrainContext {
  return {
    version: BRAIN_CONTEXT_VERSION,
    clientId: CLIENT_A,
    request: {
      surface: "content",
      channel: "linkedin",
      contentType: "founder_opinion",
      topic: "Private credit",
      selectedVaultSourceIds: [ITEM_ID],
      includeMarketIntelligence: true,
    },
    company: { fields: { company_name: "Example" }, companyDnaUpdatedAt: null },
    knowledge: {
      sources: [{
        itemId: ITEM_ID,
        chunkId: null,
        title: "Company private credit guide",
        excerpt: "Company knowledge excerpt.",
        category: "reference",
        sourceUrl: null,
        selectionMethod: "selected",
        relevance: 0.9,
        selectionReason: "Selected for this topic.",
      }],
      retrievalQuery: "Private credit",
      retrievalMethod: "hybrid-v1",
      coverage: "strong",
    },
    library: {
      sources: [{
        entryId: LIBRARY_ENTRY_ID,
        versionId: LIBRARY_VERSION_ID,
        chunkId: null,
        versionNumber: 1,
        title: "SEO foundations",
        excerpt: "Match every page to a clear search intent.",
        category: "SEO",
        sourceUrl: null,
        tags: ["seo"],
        selectionMethod: "lexical_recovery",
        relevance: 0.7,
        selectionReason: "Recovered through published-release matching.",
      }],
      retrievalQuery: "Private credit",
      retrievalMethod: "lexical_recovery",
      coverage: "weak",
      availability: "degraded",
    },
    coaching: { availability: "not_requested", goals: [], commitments: [], memories: [], feedback: [] },
    style: {
      source: "approved_channel_analysis",
      profileId: null,
      profileVersion: null,
      channel: "linkedin",
      confidence: 86,
      resolvedInstructions: ["Use direct founder observations."],
      hardRules: [],
    },
    memories: [{
      memoryId: MEMORY_ID,
      kind: "preference",
      content: "Use a discussion question.",
      confidence: 82,
      pinned: false,
      scope: { surfaces: ["content"], channels: ["linkedin"], global: false },
      relevance: 0.88,
      rankScore: 0.85,
      selectionReason: "Matches this LinkedIn content request.",
    }],
    market: {
      included: true,
      snapshotIds: [],
      insights: [{
        insightId: "gap-1",
        kind: "positioning_gap",
        summary: "Competitors rarely explain the borrower perspective.",
        competitorIds: [],
        sourceItemIds: [],
        confidence: "medium",
      }],
    },
    warnings: [{
      code: "business_library_search_degraded",
      message: "Business Library search recovered through its published-release fallback.",
      severity: "warning",
    }],
    provenance: {
      resolverVersion: BRAIN_RESOLVER_VERSION,
      generatedAt: "2026-07-31T02:00:00.000Z",
      model: "test-model",
      promptVersion: "test-prompt",
      companyDnaUpdatedAt: null,
      styleProfileId: null,
      styleProfileVersion: null,
      vaultItemIds: [ITEM_ID],
      vaultChunkIds: [],
      libraryEntryIds: [LIBRARY_ENTRY_ID],
      libraryVersionIds: [LIBRARY_VERSION_ID],
      libraryChunkIds: [],
      memoryIds: [MEMORY_ID],
      marketSnapshotIds: [],
      coachGoalIds: [],
      coachCommitmentIds: [],
      coachMemoryIds: [],
      coachFeedbackSignalIds: [],
    },
  };
}

function snapshotQuery(data: unknown) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "client_admin", client_id: CLIENT_A },
  });
});

it("rejects a cross-tenant snapshot before any database read", async () => {
  const response = await GET(
    new NextRequest(`https://portal.test/api/brain/context-used?clientId=${CLIENT_B}&snapshotId=${SNAPSHOT_ID}`),
    routeCtx,
  );
  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it("returns five explicitly separated influence areas with contextual readiness", async () => {
  const context = snapshot();
  context.knowledge.sources.push({
    ...context.knowledge.sources[0],
    chunkId: "88888888-8888-4888-8888-888888888888",
    excerpt: "A second relevant passage from the same company guide.",
  });
  context.provenance.vaultChunkIds.push("88888888-8888-4888-8888-888888888888");
  const query = snapshotQuery({
    id: SNAPSHOT_ID,
    client_id: CLIENT_A,
    snapshot_hash: "a".repeat(64),
    snapshot: context,
    created_at: "2026-07-31T02:00:00.000Z",
    artifact_kind: "content_piece",
    artifact_id: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query) });

  const response = await GET(
    new NextRequest(`https://portal.test/api/brain/context-used?clientId=${CLIENT_A}&snapshotId=${SNAPSHOT_ID}`),
    routeCtx,
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.companyKnowledge.sources[0].title).toBe("Company private credit guide");
  expect(body.companyKnowledge.sources).toHaveLength(1);
  expect(body.companyKnowledge.sources[0].matchingExcerptCount).toBe(2);
  expect(body.businessLibrary.sources[0]).toMatchObject({
    title: "SEO foundations",
    versionNumber: 1,
  });
  expect(body.businessLibrary.availability).toBe("degraded");
  expect(body.recoverableWarnings).toContainEqual(expect.objectContaining({
    code: "business_library_search_degraded",
  }));
  expect(body.companyVoice.instructions).toEqual(["Use direct founder observations."]);
  expect(body.learnedPreferences[0].reason).toContain("LinkedIn");
  expect(body.marketContext.insights[0].kind).toBe("positioning_gap");
  expect(body.contextualReadiness).toMatchObject({
    channel: "linkedin",
    channelReadiness: "strong",
    voiceConfidence: "high",
    vaultCoverage: "strong",
    relevantLessons: 1,
  });
});
