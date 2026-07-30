/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/edge-proxy", () => ({ proxyToEdgeFunction: jest.fn() }));
jest.mock("@/lib/brain/llm", () => ({
  chatProvider: jest.fn(() => null),
  chatModel: jest.fn(() => "test-model"),
}));
jest.mock("@/lib/rate-limit", () => ({
  aiGenerateLimiter: { check: jest.fn(() => ({ allowed: true })) },
  tooManyRequests: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { GET, PATCH, POST } from "@/app/api/content/voice-evaluations/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const EVALUATION_ID = "33333333-3333-4333-8333-333333333333";
const routeCtx = { params: Promise.resolve({}) };

function chain(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "order", "limit", "insert", "update"]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

function request(method: "GET" | "POST" | "PATCH", body?: unknown) {
  return new NextRequest(
    method === "GET"
      ? `https://portal.test/api/content/voice-evaluations?client_id=${CLIENT_ID}`
      : "https://portal.test/api/content/voice-evaluations",
    {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

const styleProfile = {
  schema_version: 1,
  summary: "Direct and practical.",
  voice_traits: ["Direct", "Evidence-led"],
  tone: "Calm confidence",
  audience_relationship: "Informed peers",
  hook_patterns: ["Concrete tension"],
  structure_patterns: ["Hook, explanation, question"],
  sentence_style: "Short",
  paragraph_style: "Short",
  formatting_patterns: ["Whitespace"],
  vocabulary_patterns: ["Practical"],
  cta_patterns: ["One question"],
  emoji_usage: "None",
  hashtag_usage: "Restrained",
  content_patterns: ["Practical explanation"],
  avoid_patterns: ["Hype"],
  confidence: "high",
  evidence: [
    { source_item_id: "44444444-4444-4444-8444-444444444444", observations: ["Direct"] },
    { source_item_id: "55555555-5555-4555-8555-555555555555", observations: ["Brief"] },
  ],
};

const goldens = Array.from({ length: 5 }, (_, index) => ({
  id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  client_id: CLIENT_ID,
  channel: "linkedin",
  title: `Golden ${index}`,
  body: `A practical published example ${index} with enough original client language for private evaluation.`,
  source_url: null,
  published_at: "2026-07-01T00:00:00.000Z",
  content_type: "educational",
  represents_brand_strongly: true,
  voice_traits: ["Direct"],
  structural_traits: ["Short paragraphs"],
  vocabulary_preferences: ["practical"],
  admin_notes: null,
  evaluation_permission: true,
  status: "approved",
  content_hash: "a".repeat(64),
  approved_at: "2026-07-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
}));

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "client_admin", client_id: CLIENT_ID },
  });
});

test("does not reveal the A/B assignment before a human review", async () => {
  const rows = chain({
    data: [{
      id: EVALUATION_ID,
      client_id: CLIENT_ID,
      channel: "linkedin",
      status: "ready",
      brief: {},
      variant_a: "Draft A",
      variant_b: "Draft B",
      assignment: { a: "conditioned", b: "baseline" },
      automated_evaluation: {},
      preferred_variant: null,
      reviewer_notes: null,
      reviewed_at: null,
      created_at: "2026-07-30T00:00:00.000Z",
    }],
    error: null,
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => rows) });

  const response = await GET(request("GET"), routeCtx);
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json[0].assignment).toBeUndefined();
  expect(json[0].revealed_winner).toBeUndefined();
});

test("runs conditioned and baseline drafts through the real edge orchestration without persisting", async () => {
  let evaluationCalls = 0;
  const inserted = chain({ data: { id: EVALUATION_ID }, error: null });
  const completedRow = {
    id: EVALUATION_ID,
    client_id: CLIENT_ID,
    channel: "linkedin",
    status: "ready",
    brief: {},
    variant_a: "Draft A",
    variant_b: "Draft B",
    automated_evaluation: {},
    preferred_variant: null,
    reviewer_notes: null,
    reviewed_at: null,
    created_at: "2026-07-30T00:00:00.000Z",
  };
  const completed = chain({ data: completedRow, error: null });
  const from = jest.fn((table: string) => {
    if (table === "content_golden_examples") return chain({ data: goldens, error: null });
    if (table === "content_style_analyses") {
      return chain({ data: { id: "77777777-7777-4777-8777-777777777777", analysis: styleProfile }, error: null });
    }
    if (table === "competitor_content_items") return chain({ data: [], error: null });
    if (table === "content_voice_evaluations") {
      evaluationCalls += 1;
      return evaluationCalls === 1 ? inserted : completed;
    }
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  (proxyToEdgeFunction as jest.Mock).mockImplementation(async (_name: string, body: { evaluationStyleMode: string }) =>
    NextResponse.json({
      body: body.evaluationStyleMode === "conditioned" ? "Conditioned practical draft." : "Baseline generic draft.",
      warnings: [],
    }));

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    channel: "linkedin",
    title: "A practical client update",
    objective: "Explain one useful issue to prospective clients.",
    audience: "Business owners",
  }), routeCtx);

  expect(response.status).toBe(201);
  expect(proxyToEdgeFunction).toHaveBeenCalledTimes(2);
  expect(proxyToEdgeFunction).toHaveBeenCalledWith("content-generate", expect.objectContaining({
    persist: false,
    evaluationStyleMode: "conditioned",
  }));
  expect(proxyToEdgeFunction).toHaveBeenCalledWith("content-generate", expect.objectContaining({
    persist: false,
    evaluationStyleMode: "baseline",
  }));
  expect(completed.update).toHaveBeenCalledWith(expect.objectContaining({
    status: "ready",
    automated_evaluation: expect.objectContaining({ rubricVersion: 1 }),
  }));
});

test("reveals the assignment only after the atomic review succeeds", async () => {
  const reviewed = {
    id: EVALUATION_ID,
    client_id: CLIENT_ID,
    channel: "linkedin",
    status: "reviewed",
    brief: {},
    variant_a: "Draft A",
    variant_b: "Draft B",
    assignment: { a: "baseline", b: "conditioned" },
    automated_evaluation: {},
    preferred_variant: "b",
    reviewer_notes: "B sounds more specific.",
    reviewed_at: "2026-07-30T00:00:00.000Z",
    created_at: "2026-07-30T00:00:00.000Z",
  };
  const rpcResult = chain({ data: reviewed, error: null });
  const rpc = jest.fn(() => rpcResult);
  (createAdminClient as jest.Mock).mockReturnValue({ rpc });

  const response = await PATCH(request("PATCH", {
    client_id: CLIENT_ID,
    id: EVALUATION_ID,
    preferred_variant: "b",
    reviewer_notes: "B sounds more specific.",
  }), routeCtx);
  const json = await response.json();
  expect(response.status).toBe(200);
  expect(json.assignment).toBeUndefined();
  expect(json.revealed_winner).toBe("conditioned");
  expect(json.revealed_assignment).toEqual({ variant_a: "baseline", variant_b: "conditioned" });
  expect(rpc).toHaveBeenCalledWith("review_content_voice_evaluation", expect.objectContaining({
    p_client_id: CLIENT_ID,
    p_evaluation_id: EVALUATION_ID,
    p_preferred_variant: "b",
  }));
});
