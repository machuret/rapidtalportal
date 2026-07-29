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
jest.mock("@/lib/brain/embed", () => ({ embeddingFit: jest.fn(async () => null) }));
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
  for (const method of ["select", "eq", "order", "limit"]) {
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
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            topics: [
              {
                title: "A defensible gap",
                description: "An original company angle.",
                content_type: "linkedin",
                rationale: "The market discusses the problem but not this practical angle.",
                fit: 88,
                opportunity_type: "gap",
                evidence_summary: "The competitor repeatedly frames the industry problem.",
                evidence_ids: [ITEM_ID],
              },
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
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const response = await POST(request({
      client_id: CLIENT_ID,
      count: 3,
      mode: "competitor_gap",
    }), routeCtx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.topics).toHaveLength(1);
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
    });
    expect(json.warning).toContain("removed");
    const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(modelBody.messages[1].content).toContain(`id="${ITEM_ID}"`);
    expect(modelBody.messages[1].content).toContain("Never copy its wording or voice.");
    fetchMock.mockRestore();
  });

  test("does not allow a requested competitor outside the tenant boundary", async () => {
    const from = jest.fn(() => fluent({
      data: [{ id: COMPETITOR_ID, name: "Tenant competitor" }],
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
