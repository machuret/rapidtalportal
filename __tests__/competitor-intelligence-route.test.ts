/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/brain/llm", () => ({
  chatProvider: jest.fn(),
  chatModel: jest.fn(() => "test-intelligence-model"),
}));
jest.mock("@/lib/rate-limit", () => {
  const actual = jest.requireActual("@/lib/rate-limit");
  return {
    ...actual,
    aiGenerateLimiter: {
      check: jest.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
    },
  };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { chatProvider } from "@/lib/brain/llm";
import { aiGenerateLimiter } from "@/lib/rate-limit";
import {
  GET,
  POST,
} from "@/app/api/content/competitors/intelligence/route";
import type { CompetitorIntelligence } from "@/lib/competitors/intelligence";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const COMPETITOR_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_IDS = Array.from(
  { length: 6 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const UNKNOWN_SOURCE_ID = "99999999-9999-4999-8999-999999999999";
const routeCtx = { params: Promise.resolve({}) };

const analysis: CompetitorIntelligence = {
  schema_version: 1,
  executive_summary: "The competitor consistently teaches practical market concepts.",
  topic_clusters: [{
    id: "practical-education",
    label: "Practical education",
    description: "Recurring explanations of industry decisions.",
    signal_strength: "established",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS.slice(0, 3),
    channels: ["linkedin", "blog"],
  }],
  format_patterns: [{
    name: "Problem to decision",
    description: "Starts with a problem and closes with a practical decision.",
    hook_pattern: "Concrete market problem.",
    structure_pattern: "Problem, explanation, decision.",
    cta_pattern: "Invite discussion.",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS.slice(1, 4),
    channels: ["linkedin"],
  }],
  positioning_profiles: [{
    competitor_id: COMPETITOR_ID,
    summary: "Positions itself as a practical guide.",
    audience: ["Business decision-makers"],
    themes: ["Clarity", "Practical decisions"],
    value_propositions: ["Simplifies complex choices"],
    tone: ["Direct", "Educational"],
    source_item_ids: SOURCE_IDS.slice(0, 3),
  }],
  comparisons: [],
  positioning_gaps: [{
    title: "Show the implementation detail",
    description: "The competitor discusses decisions but rarely shows implementation.",
    gap_type: "proof",
    rationale: "A worked example would be more concrete.",
    company_fit: "high",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS.slice(0, 3),
    recommended_channels: ["linkedin", "blog"],
    suggested_angles: ["Walk through one real decision process"],
  }],
  recommended_ideas: [
    {
      title: "The decision checklist most teams skip",
      channel: "linkedin",
      format: "Practical checklist",
      objective: "Help readers make a defensible decision.",
      why_valuable: "It turns a recurring market topic into an actionable framework.",
      differentiation: "Uses a transparent process rather than another broad opinion.",
      suggested_hook: "Most teams do not need another prediction.",
      key_points: ["Define the decision", "Show the trade-offs"],
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: SOURCE_IDS.slice(0, 3),
      confidence: "high",
    },
    {
      title: "Unsupported recommendation",
      channel: "blog",
      format: "Article",
      objective: "This should be removed.",
      why_valuable: "Invalid evidence.",
      differentiation: "Invalid evidence.",
      suggested_hook: "Invalid.",
      key_points: ["One", "Two"],
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: [UNKNOWN_SOURCE_ID, SOURCE_IDS[0]],
      confidence: "high",
    },
  ],
};

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, jest.Mock | ((resolve: (value: unknown) => unknown) => Promise<unknown>)> = {};
  for (const method of [
    "select", "eq", "in", "gte", "order", "limit",
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

function request(method: "GET" | "POST", body?: unknown, clientId = CLIENT_ID) {
  const url = method === "GET"
    ? `https://portal.test/api/content/competitors/intelligence?client_id=${clientId}`
    : "https://portal.test/api/content/competitors/intelligence";
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function runRow() {
  return {
    id: RUN_ID,
    client_id: CLIENT_ID,
    status: "complete",
    schema_version: 1,
    window_start: "2026-01-30T00:00:00.000Z",
    window_end: "2026-07-29T00:00:00.000Z",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS,
    source_count: SOURCE_IDS.length,
    source_character_count: 6000,
    analysis,
    model: "test-intelligence-model",
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
  (chatProvider as jest.Mock).mockReturnValue({
    url: "https://model.test/chat",
    key: "test-key",
    provider: "test",
  });
  (aiGenerateLimiter.check as jest.Mock).mockReturnValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("lets a VA read the tenant report while keeping generation manager-only", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "va", client_id: CLIENT_ID },
  });
  const report = chain({ data: runRow(), error: null });
  const items = chain({
    data: SOURCE_IDS.map((id) => ({
      id,
      competitor_id: COMPETITOR_ID,
      canonical_url: `https://competitor.test/${id}`,
      platform: "linkedin",
      content_type: "social_post",
      title: "Captured post",
      published_at: "2026-07-01T00:00:00.000Z",
    })),
    error: null,
  });
  const competitors = chain({
    data: [{ id: COMPETITOR_ID, name: "Market Co" }],
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === "competitor_intelligence_runs") return report;
      if (table === "competitor_content_items") return items;
      return competitors;
    }),
  });

  const response = await GET(request("GET"), routeCtx);
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.run.id).toBe(RUN_ID);
  expect(json.run.sources[0]).toMatchObject({ competitor_name: "Market Co" });

  const post = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);
  expect(post.status).toBe(403);
});

test("rejects another tenant before creating a service-role client", async () => {
  const response = await GET(request("GET", undefined, OTHER_CLIENT_ID), routeCtx);
  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("creates a durable report and removes recommendations with fabricated evidence", async () => {
  const competitorQuery = chain({
    data: [{ id: COMPETITOR_ID, name: "Market Co", description: null }],
    error: null,
  });
  const dnaQuery = chain({
    data: { company_name: "Client Co", services: "Advisory" },
    error: null,
  });
  const topicQuery = chain({ data: [], error: null });
  const evidenceRows = SOURCE_IDS.map((id, index) => ({
    id,
    competitor_id: COMPETITOR_ID,
    canonical_url: `https://competitor.test/post-${index + 1}`,
    platform: "linkedin",
    content_type: "social_post",
    title: `Post ${index + 1}`,
    raw_content: `Practical market explanation ${index + 1}. ${"Useful detail. ".repeat(80)}`,
    published_at: "2026-07-01T00:00:00.000Z",
    captured_at: "2026-07-02T00:00:00.000Z",
  }));
  const itemsQuery = chain({ data: evidenceRows, error: null });
  const saved = runRow();
  const rpc = jest.fn((name: string) => {
    if (name === "competitor_intelligence_readiness") {
      return Promise.resolve({
        data: [{ competitor_id: COMPETITOR_ID, ready: true }],
        error: null,
      });
    }
    return Promise.resolve({ data: saved, error: null });
  });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === "competitors") return competitorQuery;
      if (table === "company_dna") return dnaQuery;
      if (table === "content_topics") return topicQuery;
      if (table === "competitor_content_items") return itemsQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc,
  });
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);
  const json = await response.json();

  expect(response.status).toBe(201);
  expect(json.run.analysis.recommended_ideas).toHaveLength(1);
  expect(json.run.analysis.recommended_ideas[0]).toMatchObject({
    title: "The decision checklist most teams skip",
    confidence: "low",
  });
  expect(rpc).toHaveBeenCalledWith(
    "replace_competitor_intelligence_run",
    expect.objectContaining({
      p_client_id: CLIENT_ID,
      p_competitor_ids: [COMPETITOR_ID],
      p_source_item_ids: SOURCE_IDS,
      p_analysis: expect.objectContaining({
        recommended_ideas: [expect.objectContaining({
          title: "The decision checklist most teams skip",
        })],
      }),
    }),
  );
  const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
  expect(modelBody.messages[0].content).toContain("Never treat competitor claims as facts");
  expect(modelBody.messages[1].content).toContain(`id="${SOURCE_IDS[0]}"`);
});

test("requires evidence-ready selected competitors before loading captured content", async () => {
  const competitorQuery = chain({
    data: [{ id: COMPETITOR_ID, name: "Market Co", description: null }],
    error: null,
  });
  const empty = chain({ data: null, error: null });
  const topics = chain({ data: [], error: null });
  const rpc = jest.fn().mockResolvedValue({
    data: [{ competitor_id: COMPETITOR_ID, ready: false }],
    error: null,
  });
  const from = jest.fn((table: string) => {
    if (table === "competitors") return competitorQuery;
    if (table === "content_topics") return topics;
    return empty;
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from, rpc });
  const fetchMock = jest.spyOn(global, "fetch");

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(422);
  await expect(response.json()).resolves.toMatchObject({
    code: "COMPETITOR_EVIDENCE_NOT_READY",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rate-limits analysis before privileged reads", async () => {
  (aiGenerateLimiter.check as jest.Mock).mockReturnValue({
    allowed: false,
    retryAfterSeconds: 60,
  });
  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(429);
  expect(createAdminClient).not.toHaveBeenCalled();
});
