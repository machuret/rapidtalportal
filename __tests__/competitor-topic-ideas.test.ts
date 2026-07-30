/** @jest-environment node */

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPETITOR_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ITEM_ID = "44444444-4444-4444-8444-444444444444";
const routeCtx = { params: Promise.resolve({}) };

jest.mock("@/lib/api/with-auth", () => ({
  withAuth: (handler: (req: Request, context: unknown) => unknown) =>
    (req: Request) => handler(req, {
      user: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "client_admin",
        client_id: CLIENT_ID,
      },
    }),
}));
jest.mock("@/lib/rate-limit", () => ({
  aiGenerateLimiter: { check: jest.fn(() => ({ allowed: true })) },
  tooManyRequests: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/prompts/server", () => ({ renderPrompt: jest.fn(async () => "System prompt") }));
jest.mock("@/lib/brain/context", () => ({ buildBrainContext: jest.fn() }));
jest.mock("@/lib/brain/embed", () => ({
  cosine: jest.fn(() => 0.5),
  embeddingFit: jest.fn(async () => null),
  embedTexts: jest.fn(async (texts: string[]) => texts.map(() => [1, 0])),
}));
jest.mock("@/lib/brain/events", () => ({ logBrainEvent: jest.fn(async () => undefined) }));
jest.mock("@/lib/brain/llm", () => ({
  chatProvider: jest.fn(() => ({
    url: "https://llm.test/chat",
    key: "test-key",
    provider: "test",
  })),
  chatModel: jest.fn(() => "test-model"),
}));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBrainContext } from "@/lib/brain/context";
import { POST } from "@/app/api/content/topics/generate/route";

function fluent(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock | ((resolve: (value: unknown) => unknown) => Promise<unknown>)> = {};
  for (const method of ["select", "eq", "in", "or", "order", "limit"]) {
    chain[method] = jest.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return chain;
}

function request(body: unknown): NextRequest {
  return new NextRequest("https://portal.test/api/content/topics/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (buildBrainContext as jest.Mock).mockResolvedValue({
    text: "COMPANY PROFILE\nTrusted company facts and voice.",
    hasProfile: true,
    hasVault: true,
    memories: 0,
    positives: 0,
    negatives: 0,
    positiveExamples: [],
    negativeExamples: [],
  });
});

describe("competitor-gap topic generation", () => {
  test("keeps only ideas citing verified tenant-scoped evidence and returns provenance", async () => {
    const from = jest.fn((table: string) => {
      if (table === "vault_items" || table === "content_pieces") {
        return fluent({ data: [], error: null });
      }
      if (table === "competitors") {
        return fluent({ data: [{ id: COMPETITOR_ID, name: "Market Co" }], error: null });
      }
      if (table === "competitor_content_items") {
        return fluent({
          data: [{
            id: ITEM_ID,
            competitor_id: COMPETITOR_ID,
            canonical_url: "https://market.example/article",
            platform: "web",
            content_type: "article",
            title: "Market article",
            raw_content: "A recurring industry topic with enough detail to identify a useful editorial gap.",
            published_at: "2026-07-01T00:00:00.000Z",
            captured_at: "2026-07-02T00:00:00.000Z",
          }],
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        competitor_id: COMPETITOR_ID,
        ready: true,
        captured_items: 8,
        content_characters: 6000,
      }],
      error: null,
    });
    (createAdminClient as jest.Mock).mockReturnValue({ from, rpc });
    const completeIdea = (title: string) => ({
      title,
      hook: "A practical recurring industry gap the market keeps missing",
      topic: "Practical recurring industry market gap",
      description: "An original practical company angle on a recurring industry topic.",
      content_type: "linkedin",
      intended_audience: "Business decision makers",
      strategic_objective: "Demonstrate a useful company point of view",
      why_valuable: "It answers a recurring industry market question with a practical angle.",
      company_dna_fit: "It uses the company’s practical evidence-led positioning.",
      vault_evidence_ids: [],
      rationale: "The market discusses the recurring industry topic but not this practical angle.",
      fit: 88,
      opportunity_type: "gap",
      evidence_summary: "The competitor repeatedly frames the recurring industry topic.",
      evidence_ids: [ITEM_ID],
      difference_from_competitors: "It explains the practical next step competitors omit.",
      existing_content_ids: [],
      difference_from_existing: "No equivalent company content was found.",
      recommended_format: "A concise LinkedIn point-of-view post",
      recommended_cta: "Ask readers which constraint they see most often",
    });
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            topics: [
              completeIdea("A defensible gap"),
              {
                title: "Spoofed evidence",
                description: "Must be removed.",
                content_type: "blog",
                rationale: "Unsupported.",
                fit: 90,
                opportunity_type: "gap",
                evidence_summary: "Invalid.",
                evidence_ids: [OTHER_ITEM_ID],
              },
            ],
          }),
        },
      }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              topics: [
                completeIdea("A defensible gap"),
                completeIdea("A second defensible gap"),
                completeIdea("A third defensible gap"),
              ],
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const response = await POST(request({
      client_id: CLIENT_ID,
      count: 3,
      mode: "competitor_gap",
    }), routeCtx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.topics).toHaveLength(3);
    expect(json.topics[0]).toMatchObject({
      title: "A defensible gap",
      opportunity_type: "gap",
      competitor_evidence: [{
        item_id: ITEM_ID,
        competitor_id: COMPETITOR_ID,
        competitor_name: "Market Co",
        url: "https://market.example/article",
      }],
      why: {
        competitor_evidence: 1,
        competitors: ["Market Co"],
        competitor_sources: [{ item_id: ITEM_ID }],
      },
      explainability: {
        hook: "A practical recurring industry gap the market keeps missing",
        intendedAudience: "Business decision makers",
        supportingMarketSignals: [{ itemId: ITEM_ID, competitorName: "Market Co" }],
        differenceFromCompetitors: "It explains the practical next step competitors omit.",
        differenceFromExisting: expect.stringContaining("No source-grounded comparison claim was verified"),
        recommendedFormat: "A concise LinkedIn point-of-view post",
        confidence: expect.stringMatching(/low|medium|high/u),
        scores: {
          companyRelevance: { score: expect.any(Number), explanation: expect.any(String) },
          audienceRelevance: { score: expect.any(Number), explanation: expect.any(String) },
          vaultEvidenceStrength: { score: expect.any(Number), explanation: expect.any(String) },
          marketOpportunity: { score: expect.any(Number), explanation: expect.any(String) },
          differentiation: { score: expect.any(Number), explanation: expect.any(String) },
          novelty: { score: expect.any(Number), explanation: expect.any(String) },
          channelFit: { score: expect.any(Number), explanation: expect.any(String) },
        },
      },
    });
    expect(json.warning).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(modelBody.messages[1].content).toContain(`id="${ITEM_ID}"`);
    expect(modelBody.messages[1].content).toContain("Never copy its wording or voice.");
    expect(json.topics[0].explainability.evidenceVerification).toMatchObject({
      method: "semantic_embeddings",
      verifiedCompetitorIds: [ITEM_ID],
      competitorComparisonVerified: true,
    });
    fetchMock.mockRestore();
  });

  test("supports the declared maximum of twenty complete ideas with a scaled output budget", async () => {
    const from = jest.fn(() => fluent({ data: [], error: null }));
    (createAdminClient as jest.Mock).mockReturnValue({ from, rpc: jest.fn() });
    const topics = Array.from({ length: 20 }, (_, index) => ({
      title: `Complete idea ${index + 1}`,
      hook: `A useful hook ${index + 1}`,
      topic: `Useful topic ${index + 1}`,
      description: "A practical company-led explanation for a relevant audience.",
      content_type: "linkedin",
      intended_audience: "Business decision makers",
      strategic_objective: "Explain a useful company point of view",
      why_valuable: "It answers a recurring audience question.",
      company_dna_fit: "It follows the company’s practical style.",
      vault_evidence_ids: [],
      rationale: "A useful editorial opportunity.",
      fit: 80,
      opportunity_type: null,
      evidence_summary: "No external evidence was requested.",
      evidence_ids: [],
      difference_from_competitors: "",
      existing_content_ids: [],
      difference_from_existing: "This angle should be reviewed against existing content.",
      recommended_format: "A concise LinkedIn post",
      recommended_cta: "Invite readers to discuss the topic",
    }));
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ topics }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const response = await POST(request({
      client_id: CLIENT_ID,
      count: 20,
      mode: "company",
    }), routeCtx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.topics).toHaveLength(20);
    const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(modelBody.max_tokens).toBe(13_000);
    fetchMock.mockRestore();
  });

  test("returns valid ideas when one candidate is malformed and the repair provider is unavailable", async () => {
    const from = jest.fn(() => fluent({ data: [], error: null }));
    (createAdminClient as jest.Mock).mockReturnValue({ from, rpc: jest.fn() });
    const completeIdea = {
      title: "A usable company idea",
      hook: "A practical hook",
      topic: "A useful topic",
      description: "A practical company-led explanation for a relevant audience.",
      content_type: "linkedin",
      intended_audience: "Business decision makers",
      strategic_objective: "Explain a useful company point of view",
      why_valuable: "It answers a recurring audience question.",
      company_dna_fit: "It follows the company’s practical style.",
      vault_evidence_ids: [],
      rationale: "A useful editorial opportunity.",
      fit: 80,
      opportunity_type: null,
      evidence_summary: "No external evidence was requested.",
      evidence_ids: [],
      difference_from_competitors: "",
      existing_content_ids: [],
      difference_from_existing: "This angle should be reviewed against existing content.",
      recommended_format: "A concise LinkedIn post",
      recommended_cta: "Invite readers to discuss the topic",
      harmless_extra_model_field: "must not invalidate the whole response",
    };
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              topics: [
                completeIdea,
                { title: "Missing required fields" },
                null,
              ],
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 429, message: "rate limited" },
      }), { status: 429, headers: { "content-type": "application/json" } }));

    const response = await POST(request({
      client_id: CLIENT_ID,
      count: 3,
      mode: "company",
    }), routeCtx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.topics).toHaveLength(1);
    expect(json.topics[0].title).toBe("A usable company idea");
    expect(json.warning).toContain("Generated 1 of 3 requested ideas");
    expect(json.warning).toContain("repair attempt was unavailable");
    fetchMock.mockRestore();
  });

  test("returns a specific client-safe error when the provider rejects the key limit", async () => {
    const from = jest.fn(() => fluent({ data: [], error: null }));
    (createAdminClient as jest.Mock).mockReturnValue({ from, rpc: jest.fn() });
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: { code: 402, message: "provider detail must remain private" },
      }), { status: 402, headers: { "content-type": "application/json" } }),
    );

    const response = await POST(request({
      client_id: CLIENT_ID,
      count: 3,
      mode: "company",
    }), routeCtx);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The content AI provider rejected the API key's balance or spending limit.",
      code: "CONTENT_AI_LIMIT",
    });
    fetchMock.mockRestore();
  });

  test("does not allow a requested competitor outside the tenant boundary", async () => {
    const from = jest.fn((table: string) => fluent({
      data: table === "vault_items" || table === "content_pieces"
        ? []
        : [{ id: COMPETITOR_ID, name: "Tenant competitor" }],
      error: null,
    }));
    const rpc = jest.fn().mockResolvedValue({
      data: [{ competitor_id: COMPETITOR_ID, ready: true }],
      error: null,
    });
    (createAdminClient as jest.Mock).mockReturnValue({ from, rpc });

    const response = await POST(request({
      client_id: CLIENT_ID,
      count: 3,
      mode: "competitor_gap",
      competitor_ids: ["99999999-9999-4999-8999-999999999999"],
    }), routeCtx);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "COMPETITOR_EVIDENCE_NOT_READY",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
