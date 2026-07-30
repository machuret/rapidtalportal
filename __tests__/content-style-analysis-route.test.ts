/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/brain/llm", () => ({
  chatProvider: jest.fn(),
  chatModel: jest.fn(() => "openai/gpt-4o-mini"),
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
  PATCH,
  POST,
} from "@/app/api/content/style-analysis/route";
import type { StyleAnalysisProfile } from "@/lib/content/style-analysis";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANALYSIS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_IDS = [
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
];
const routeCtx = { params: Promise.resolve({}) };

const profile: StyleAnalysisProfile = {
  schema_version: 1,
  summary: "Direct, practical and evidence-led.",
  voice_traits: ["Candid", "Confident"],
  tone: "Professional without sounding formal.",
  audience_relationship: "Addresses readers as informed peers.",
  hook_patterns: ["Open with a concrete tension."],
  structure_patterns: ["Hook, explanation, practical implication, question."],
  sentence_style: "Mostly short declarative sentences.",
  paragraph_style: "One or two sentences per paragraph.",
  formatting_patterns: ["Frequent whitespace."],
  vocabulary_patterns: ["Plain-English financial language."],
  cta_patterns: ["End with one reflective question."],
  emoji_usage: "No emojis observed.",
  hashtag_usage: "Three restrained topic hashtags at the end.",
  content_patterns: ["Explain a market issue through a practical example."],
  avoid_patterns: ["Avoid hype and generic inspiration."],
  confidence: "high",
  evidence: SOURCE_IDS.map((source_item_id) => ({
    source_item_id,
    observations: ["Uses short paragraphs and a direct opening."],
  })),
};

function chain(result: { data?: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of [
    "select", "eq", "neq", "in", "contains", "order", "limit", "insert", "update",
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

function request(method: "GET" | "POST" | "PATCH", body?: unknown, clientId = CLIENT_A) {
  const url = method === "GET"
    ? `https://portal.test/api/content/style-analysis?client_id=${clientId}`
    : "https://portal.test/api/content/style-analysis";
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function analysisRow(status: "draft" | "approved" = "draft") {
  return {
    id: ANALYSIS_ID,
    client_id: CLIENT_A,
    channel: "linkedin",
    status,
    analysis: profile,
    source_item_ids: SOURCE_IDS,
    source_count: 3,
    source_character_count: 2400,
    model: "openai/gpt-4o-mini",
    analysed_at: "2026-07-29T01:00:00.000Z",
    approved_at: status === "approved" ? "2026-07-29T02:00:00.000Z" : null,
    created_at: "2026-07-29T01:00:00.000Z",
    updated_at: "2026-07-29T01:00:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_A },
  });
  (chatProvider as jest.Mock).mockReturnValue({
    url: "https://model.test/chat",
    key: "test-key",
    provider: "openrouter",
  });
  (aiGenerateLimiter.check as jest.Mock).mockReturnValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("lets a VA inspect their client's approved profile without granting writes", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "va", client_id: CLIENT_A },
  });
  const analyses = chain({ data: [analysisRow("approved")], error: null });
  const sources = chain({
    data: SOURCE_IDS.map((id, index) => ({
      id,
      title: `Example ${index + 1}`,
      source_url: `https://www.linkedin.com/posts/example-${index + 1}`,
      raw_content: "A".repeat(800),
      status: "ready",
      tags: ["linkedin", "style_example"],
      created_at: "2026-07-29T00:00:00.000Z",
    })),
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => table === "content_style_analyses" ? analyses : sources),
  });

  const getResponse = await GET(request("GET"), routeCtx);
  expect(getResponse.status).toBe(200);
  await expect(getResponse.json()).resolves.toMatchObject({
    channels: {
      linkedin: {
        approved: { id: ANALYSIS_ID, status: "approved" },
        draft: null,
      },
    },
  });

  const postResponse = await POST(request("POST", {
    client_id: CLIENT_A,
    channel: "linkedin",
    expected_updated_at: null,
  }), routeCtx);
  expect(postResponse.status).toBe(403);
});

test("rejects cross-tenant reads before creating a service-role client", async () => {
  const response = await GET(request("GET", undefined, CLIENT_B), routeCtx);
  expect(response.status).toBe(403);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("analyses processed owned examples into a review draft without activating it", async () => {
  const sourceRows = SOURCE_IDS.map((id, index) => ({
    id,
    title: `Owned post ${index + 1}`,
    source_url: `https://www.linkedin.com/posts/company-${index + 1}`,
    raw_content: `Owned example ${index + 1}. ${"Practical company writing. ".repeat(35)}`,
    status: "ready",
    tags: ["linkedin", "style_example"],
    created_at: "2026-07-29T00:00:00.000Z",
  }));
  const sources = chain({ data: sourceRows, error: null });
  const draftCheck = chain({ data: null, error: null });
  const inserted = chain({ data: analysisRow("draft"), error: null });
  let analysisCalls = 0;
  const from = jest.fn((table: string) => {
    if (table === "vault_items") return sources;
    if (table === "content_style_analyses") {
      analysisCalls++;
      return analysisCalls === 1 ? draftCheck : inserted;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(profile) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );

  const response = await POST(request("POST", {
    client_id: CLIENT_A,
    channel: "linkedin",
    expected_updated_at: null,
  }), routeCtx);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    success: true,
    draft: { id: ANALYSIS_ID, status: "draft" },
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
  expect(modelBody.messages[0].content).toContain("untrusted data");
  expect(modelBody.messages[1].content).toContain(SOURCE_IDS[0]);
  expect(inserted.insert).toHaveBeenCalledWith(expect.objectContaining({
    client_id: CLIENT_A,
    channel: "linkedin",
    status: "draft",
    source_item_ids: SOURCE_IDS,
    analysis: expect.objectContaining({ confidence: "low" }),
  }));
});

test("rate-limits repeated model analysis before loading service-role data", async () => {
  (aiGenerateLimiter.check as jest.Mock).mockReturnValue({
    allowed: false,
    retryAfterSeconds: 60,
  });

  const response = await POST(request("POST", {
    client_id: CLIENT_A,
    channel: "linkedin",
    expected_updated_at: null,
  }), routeCtx);

  expect(response.status).toBe(429);
  expect(createAdminClient).not.toHaveBeenCalled();
  expect(chatProvider).not.toHaveBeenCalled();
});

test("requires enough processed evidence before spending a model request", async () => {
  const sources = chain({
    data: [{
      id: SOURCE_IDS[0],
      title: "Only example",
      source_url: null,
      raw_content: "A".repeat(800),
      status: "ready",
      tags: ["linkedin"],
      created_at: "2026-07-29T00:00:00.000Z",
    }],
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => sources) });
  const fetchMock = jest.spyOn(global, "fetch");

  const response = await POST(request("POST", {
    client_id: CLIENT_A,
    channel: "linkedin",
    expected_updated_at: null,
  }), routeCtx);
  expect(response.status).toBe(422);
  await expect(response.json()).resolves.toMatchObject({
    code: "STYLE_EVIDENCE_NOT_READY",
    source_count: 1,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("approves a reviewed draft only through the atomic database operation", async () => {
  const current = chain({ data: analysisRow("draft"), error: null });
  const saved = chain({ data: analysisRow("draft"), error: null });
  let styleCalls = 0;
  const rpc = jest.fn().mockResolvedValue({ data: analysisRow("approved"), error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => {
      styleCalls++;
      return styleCalls === 1 ? current : saved;
    }),
    rpc,
  });

  const response = await PATCH(request("PATCH", {
    client_id: CLIENT_A,
    id: ANALYSIS_ID,
    action: "approve",
    analysis: profile,
    expected_updated_at: analysisRow("draft").updated_at,
  }), routeCtx);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    success: true,
    approved: { id: ANALYSIS_ID, status: "approved" },
  });
  expect(rpc).toHaveBeenCalledWith("approve_content_style_analysis", {
    p_client_id: CLIENT_A,
    p_analysis_id: ANALYSIS_ID,
    p_actor_id: USER_ID,
  });
});

test("records only examples actually included in the bounded model prompt", async () => {
  const manySourceIds = Array.from(
    { length: 20 },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const sourceRows = manySourceIds.map((id, index) => ({
    id,
    title: `Long owned post ${index + 1}`,
    source_url: `https://www.linkedin.com/posts/company-long-${index + 1}`,
    raw_content: "A".repeat(5000),
    status: "ready",
    tags: ["linkedin", "style_example"],
    created_at: "2026-07-29T00:00:00.000Z",
  }));
  const sources = chain({ data: sourceRows, error: null });
  const draftCheck = chain({ data: null, error: null });
  const savedRow = {
    ...analysisRow("draft"),
    analysis: {
      ...profile,
      confidence: "medium",
      evidence: manySourceIds.slice(0, 2).map((source_item_id) => ({
        source_item_id,
        observations: ["Repeated across included examples."],
      })),
    },
  };
  const inserted = chain({ data: savedRow, error: null });
  let analysisCalls = 0;
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === "vault_items") return sources;
      analysisCalls++;
      return analysisCalls === 1 ? draftCheck : inserted;
    }),
  });
  const providerProfile = {
    ...profile,
    evidence: manySourceIds.slice(0, 2).map((source_item_id) => ({
      source_item_id,
      observations: ["Repeated across included examples."],
    })),
  };
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(providerProfile) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );

  const response = await POST(request("POST", {
    client_id: CLIENT_A,
    channel: "linkedin",
    expected_updated_at: null,
  }), routeCtx);

  expect(response.status).toBe(200);
  const insertedValues = inserted.insert.mock.calls
    .map(([values]) => values)
    .find((values) => Array.isArray(values?.source_item_ids));
  expect(insertedValues).toBeDefined();
  expect(insertedValues.source_item_ids.length).toBeGreaterThanOrEqual(3);
  expect(insertedValues.source_item_ids.length).toBeLessThan(20);
  expect(insertedValues.source_count).toBe(insertedValues.source_item_ids.length);
  expect(insertedValues.source_character_count).toBe(insertedValues.source_count * 4000);
  const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
  const prompt = modelBody.messages[1].content as string;
  expect(prompt).toContain(insertedValues.source_item_ids.at(-1));
  expect(prompt).not.toContain(manySourceIds[insertedValues.source_count]);
});

test("rejects a stale refresh before calling the model", async () => {
  const sources = chain({
    data: SOURCE_IDS.map((id) => ({
      id,
      title: "Owned post",
      source_url: null,
      raw_content: "A".repeat(800),
      status: "ready",
      tags: ["linkedin"],
      created_at: "2026-07-29T00:00:00.000Z",
    })),
    error: null,
  });
  const draftCheck = chain({
    data: { id: ANALYSIS_ID, updated_at: "2026-07-29T03:00:00.000Z" },
    error: null,
  });
  let calls = 0;
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => (++calls === 1 ? sources : draftCheck)),
  });
  const fetchMock = jest.spyOn(global, "fetch");

  const response = await POST(request("POST", {
    client_id: CLIENT_A,
    channel: "linkedin",
    expected_updated_at: "2026-07-29T01:00:00.000Z",
  }), routeCtx);

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ code: "STYLE_ANALYSIS_CONFLICT" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects a stale edit instead of overwriting a newer draft", async () => {
  const current = chain({
    data: { ...analysisRow("draft"), updated_at: "2026-07-29T03:00:00.000Z" },
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => current) });

  const response = await PATCH(request("PATCH", {
    client_id: CLIENT_A,
    id: ANALYSIS_ID,
    action: "save",
    analysis: profile,
    expected_updated_at: "2026-07-29T01:00:00.000Z",
  }), routeCtx);

  expect(response.status).toBe(409);
  expect(current.update).not.toHaveBeenCalled();
});

test("rejects human-edited evidence that references sources outside the analysis", async () => {
  const current = chain({ data: analysisRow("draft"), error: null });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => current) });
  const fabricatedProfile: StyleAnalysisProfile = {
    ...profile,
    evidence: [
      profile.evidence[0],
      {
        source_item_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        observations: ["Fabricated evidence."],
      },
    ],
  };

  const response = await PATCH(request("PATCH", {
    client_id: CLIENT_A,
    id: ANALYSIS_ID,
    action: "save",
    analysis: fabricatedProfile,
    expected_updated_at: analysisRow("draft").updated_at,
  }), routeCtx);

  expect(response.status).toBe(422);
  expect(current.update).not.toHaveBeenCalled();
});
