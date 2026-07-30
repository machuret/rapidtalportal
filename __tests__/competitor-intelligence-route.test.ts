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
jest.mock("@/lib/content/pilot-observability", () => ({
  startAnalysisAttempt: jest.fn().mockResolvedValue({
    id: "77777777-7777-4777-8777-777777777777",
    lease_token: "66666666-6666-4666-8666-666666666666",
  }),
  finishAnalysisAttempt: jest.fn().mockResolvedValue(undefined),
  recordWorkflowEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/error-tracking", () => ({ captureError: jest.fn() }));

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { chatProvider } from "@/lib/brain/llm";
import { aiGenerateLimiter } from "@/lib/rate-limit";
import { captureError } from "@/lib/error-tracking";
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
const JOB_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LEASE_TOKEN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMPANY_CONTENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const VAULT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SOURCE_IDS = Array.from(
  { length: 6 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const CAPTURE_IDS = Array.from(
  { length: 6 },
  (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const UNKNOWN_SOURCE_ID = "99999999-9999-4999-8999-999999999999";
const routeCtx = { params: Promise.resolve({}) };

function exactQuote(index: number): string {
  return `Practical market explanation ${index + 1}. Useful detail helps teams make better decisions.`;
}

function quotes(ids = SOURCE_IDS.slice(0, 3)) {
  return ids.map((id) => ({
    source_item_id: id,
    quote: exactQuote(SOURCE_IDS.indexOf(id)),
  }));
}

const analysis: CompetitorIntelligence = {
  schema_version: 2,
  executive_summary: "The competitor consistently teaches practical market concepts.",
  topic_clusters: [{
    id: "practical-education",
    label: "Practical education",
    description: "Recurring explanations of industry decisions.",
    signal_strength: "established",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS.slice(0, 3),
    evidence_quotes: quotes(),
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
    evidence_quotes: quotes(SOURCE_IDS.slice(1, 4)),
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
    evidence_quotes: quotes(),
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
    evidence_quotes: quotes(),
    recommended_channels: ["linkedin", "blog"],
    suggested_angles: ["Walk through one real decision process"],
  }],
  recommended_ideas: [
    {
      title: "The decision checklist most teams skip",
      channel: "linkedin",
      format: "Checklist",
      objective: "Help readers make one practical decision.",
      why_valuable: "It turns a recurring market topic into an actionable framework.",
      differentiation: "Uses a transparent process rather than another broad opinion.",
      suggested_hook: "Most teams do not need another prediction.",
      key_points: ["Define the decision", "Show the trade-offs"],
      competitor_ids: [COMPETITOR_ID],
      source_item_ids: SOURCE_IDS.slice(0, 3),
      evidence_quotes: quotes(),
      company_reference_ids: [COMPANY_CONTENT_ID, VAULT_ID],
      novelty: "adjacent",
      overlap_warning: "The company has covered decisions, but not as a checklist.",
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
      evidence_quotes: [
        { source_item_id: UNKNOWN_SOURCE_ID, quote: "This fabricated quote has enough characters to pass the schema." },
        { source_item_id: SOURCE_IDS[0], quote: exactQuote(0) },
      ],
      company_reference_ids: [COMPANY_CONTENT_ID],
      novelty: "new",
      overlap_warning: "",
      confidence: "high",
    },
  ],
};

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, jest.Mock | ((resolve: (value: unknown) => unknown) => Promise<unknown>)> = {};
  for (const method of [
    "select", "eq", "in", "gte", "lte", "or", "order", "limit",
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

function evidenceRows() {
  return SOURCE_IDS.map((id, index) => ({
    id,
    capture_version_id: CAPTURE_IDS[index],
    content_hash: `sha256-${String(index + 1).padStart(58, "0")}`,
    competitor_id: COMPETITOR_ID,
    canonical_url: `https://competitor.test/post-${index + 1}`,
    platform: "linkedin",
    content_type: "social_post",
    title: `Post ${index + 1}`,
    raw_content: `${exactQuote(index)} ${"Useful detail. ".repeat(80)}`,
    published_at: `2026-0${(index % 3) + 5}-01T00:00:00+00:00`,
    captured_at: "2026-07-02T00:00:00+00:00",
    effective_at: `2026-0${(index % 3) + 5}-01T00:00:00+00:00`,
    date_basis: "published" as const,
  }));
}

function sourceEvidence() {
  return evidenceRows().map((row) => ({
    item_id: row.id,
    capture_version_id: row.capture_version_id,
    content_hash: row.content_hash,
    competitor_id: row.competitor_id,
    competitor_name: "Market Co",
    title: row.title,
    url: row.canonical_url,
    platform: row.platform,
    content_type: row.content_type,
    published_at: row.published_at,
    captured_at: row.captured_at,
    effective_at: row.effective_at,
    date_basis: row.date_basis,
  }));
}

function companyEvidence() {
  return [
    {
      id: COMPANY_CONTENT_ID,
      kind: "content_piece",
      title: "Existing decision guide",
      excerpt: "A previous company article about making sound decisions.",
      content_hash: "company-content-hash-000000000000000000000000000000000001",
    },
    {
      id: VAULT_ID,
      kind: "vault_item",
      title: "Company services",
      excerpt: "Verified details about the company's advisory service.",
      content_hash: "vault-content-hash-0000000000000000000000000000000000001",
    },
  ];
}

function runRow() {
  return {
    id: RUN_ID,
    job_id: JOB_ID,
    client_id: CLIENT_ID,
    status: "complete",
    schema_version: 2,
    window_start: "2026-01-30T00:00:00.000Z",
    window_end: "2026-07-29T00:00:00.000Z",
    competitor_ids: [COMPETITOR_ID],
    source_item_ids: SOURCE_IDS,
    source_count: SOURCE_IDS.length,
    source_character_count: 6000,
    fallback_date_count: 0,
    source_evidence: sourceEvidence(),
    company_evidence: companyEvidence(),
    analysis,
    model: "test-intelligence-model",
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
  };
}

function postDb(options: {
  ready?: boolean;
  modelAnalysis?: CompetitorIntelligence;
  modelResponses?: unknown[];
  claimError?: { code: string; message: string } | null;
  dnaError?: { code: string; message: string } | null;
} = {}) {
  const competitorQuery = chain({
    data: [{
      id: COMPETITOR_ID,
      name: "Market Co",
      description: null,
      website_url: "https://market.example",
    }],
    error: null,
  });
  const sourceInventoryQuery = chain({ data: [], error: null });
  const dnaQuery = chain({
    data: { company_name: "Client Co", services: "Advisory" },
    error: options.dnaError ?? null,
  });
  const topicQuery = chain({ data: [], error: null });
  const contentQuery = chain({
    data: [{
      id: COMPANY_CONTENT_ID,
      title: "Existing decision guide",
      brief: "Help teams decide.",
      body: "A previous company article about making sound decisions.",
      content_type: "blog",
      status: "approved",
      created_at: "2026-06-01T00:00:00.000Z",
    }],
    error: null,
  });
  const vaultQuery = chain({
    data: [{
      id: VAULT_ID,
      title: "Company services",
      raw_content: "Verified details about the company's advisory service.",
      ai_summary: "Company advisory services.",
      category: "services",
    }],
    error: null,
  });
  const rpc = jest.fn((name: string) => {
    if (name === "competitor_intelligence_readiness") {
      return Promise.resolve({
        data: [{
          competitor_id: COMPETITOR_ID,
          source_count: 1,
          collectable_source_count: 1,
          captured_items: 5,
          article_count: 5,
          social_post_count: 0,
          distinct_platforms: 1,
          content_characters: 6000,
          latest_capture: "2026-07-28T00:00:00.000Z",
          readiness_score: 80,
          ready: options.ready ?? true,
        }],
        error: null,
      });
    }
    if (name === "competitor_intelligence_evidence") {
      return Promise.resolve({ data: evidenceRows(), error: null });
    }
    if (name === "start_competitor_intelligence_job") {
      return Promise.resolve(options.claimError
        ? { data: null, error: options.claimError }
        : {
            data: {
              id: JOB_ID,
              status: "running",
              lease_token: LEASE_TOKEN,
              lease_until: "2026-07-29T01:00:00.000Z",
              started_at: "2026-07-29T00:00:00.000Z",
            },
            error: null,
          });
    }
    if (name === "complete_competitor_intelligence_job") {
      return Promise.resolve({ data: runRow(), error: null });
    }
    if (name === "fail_competitor_intelligence_job") {
      return Promise.resolve({ data: true, error: null });
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const from = jest.fn((table: string) => {
    if (table === "competitors") return competitorQuery;
    if (table === "competitor_sources") return sourceInventoryQuery;
    if (table === "company_dna") return dnaQuery;
    if (table === "content_topics") return topicQuery;
    if (table === "content_pieces") return contentQuery;
    if (table === "vault_items") return vaultQuery;
    throw new Error(`Unexpected table ${table}`);
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from, rpc });
  let responseIndex = 0;
  jest.spyOn(global, "fetch").mockImplementation(() => {
    const responseValue = options.modelResponses?.[responseIndex] ??
      options.modelResponses?.at(-1) ??
      options.modelAnalysis ??
      analysis;
    responseIndex += 1;
    return Promise.resolve(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(responseValue) } }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
  });
  return { rpc, from };
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

test("lets a VA read immutable tenant report provenance while keeping generation manager-only", async () => {
  (requireApiAuth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, role: "va", client_id: CLIENT_ID },
  });
  const report = chain({ data: runRow(), error: null });
  const jobs = chain({ data: null, error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) =>
      table === "competitor_intelligence_runs" ? report : jobs),
  });

  const response = await GET(request("GET"), routeCtx);
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.run.id).toBe(RUN_ID);
  expect(json.run.sources[0]).toMatchObject({
    capture_version_id: CAPTURE_IDS[0],
    content_hash: evidenceRows()[0].content_hash,
    competitor_name: "Market Co",
  });
  expect(json.run.company_sources).toHaveLength(2);

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

test("uses publication-window evidence, exact quotes, company material and an atomic leased completion", async () => {
  const { rpc } = postDb();
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
    confidence: "medium",
    company_reference_ids: [COMPANY_CONTENT_ID, VAULT_ID],
  });
  expect(rpc).toHaveBeenCalledWith(
    "competitor_intelligence_evidence",
    expect.objectContaining({
      p_client_id: CLIENT_ID,
      p_competitor_ids: [COMPETITOR_ID],
      p_window_start: expect.any(String),
      p_window_end: expect.any(String),
    }),
  );
  expect(rpc).toHaveBeenCalledWith(
    "complete_competitor_intelligence_job",
    expect.objectContaining({
      p_job_id: JOB_ID,
      p_lease_token: LEASE_TOKEN,
      p_source_evidence: expect.arrayContaining([
        expect.objectContaining({
          item_id: SOURCE_IDS[0],
          capture_version_id: CAPTURE_IDS[0],
          content_hash: evidenceRows()[0].content_hash,
          date_basis: "published",
        }),
      ]),
      p_company_evidence: expect.arrayContaining([
        expect.objectContaining({ id: COMPANY_CONTENT_ID, kind: "content_piece" }),
        expect.objectContaining({ id: VAULT_ID, kind: "vault_item" }),
      ]),
    }),
  );
  const fetchMock = global.fetch as jest.Mock;
  expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  const modelBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
  expect(modelBody.messages[0].content).toContain("exact, contiguous quotes");
  expect(modelBody.messages[1].content).toContain(`company_reference id="${COMPANY_CONTENT_ID}"`);
  expect(modelBody.messages[1].content).toContain(`capture_version_id="${CAPTURE_IDS[0]}"`);
});

test("drops a model insight whose quote is not exact while preserving the verified report", async () => {
  const invalid = structuredClone(analysis);
  invalid.recommended_ideas[0].evidence_quotes[0].quote =
    "This quote was invented and is not present in the immutable source.";
  const { rpc } = postDb({ modelAnalysis: invalid });

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    run: {
      analysis: {
        recommended_ideas: [],
      },
    },
  });
  expect(rpc).toHaveBeenCalledWith(
    "complete_competitor_intelligence_job",
    expect.objectContaining({ p_job_id: JOB_ID, p_lease_token: LEASE_TOKEN }),
  );
});

test("repairs one incomplete model report and still applies deterministic evidence checks", async () => {
  const { rpc } = postDb({
    modelResponses: [
      {
        schema_version: 2,
        executive_summary: "An incomplete first response.",
        topic_clusters: [],
      },
      analysis,
    ],
  });

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(201);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const repairBody = JSON.parse(String(
    ((global.fetch as jest.Mock).mock.calls[1][1] as RequestInit).body,
  ));
  expect(repairBody.temperature).toBe(0);
  expect(repairBody.messages[1].content).toContain("VALIDATION ERRORS");
  expect(repairBody.messages[1].content).toContain("did not contain any insight sections");
  expect(rpc).toHaveBeenCalledWith(
    "complete_competitor_intelligence_job",
    expect.objectContaining({
      p_job_id: JOB_ID,
      p_lease_token: LEASE_TOKEN,
    }),
  );
});

test("requires evidence-ready selected competitors before loading immutable evidence", async () => {
  const { rpc } = postDb({ ready: false });
  const fetchMock = global.fetch as jest.Mock;

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(422);
  await expect(response.json()).resolves.toMatchObject({
    code: "COMPETITOR_EVIDENCE_NOT_READY",
  });
  expect(rpc).not.toHaveBeenCalledWith("competitor_intelligence_evidence", expect.anything());
  expect(fetchMock).not.toHaveBeenCalled();
});

test("returns a useful service error and records the real database message when company context fails", async () => {
  postDb({
    dnaError: {
      code: "42703",
      message: "column company_dna.brand_voice does not exist",
    },
  });

  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    code: "COMPETITOR_CONTEXT_LOAD_FAILED",
    error: expect.stringContaining("required company context"),
  });
  expect(captureError).toHaveBeenCalledWith(
    "api",
    expect.objectContaining({ message: expect.stringContaining("brand_voice") }),
    expect.objectContaining({
      clientId: CLIENT_ID,
      url: "/api/content/competitors/intelligence",
    }),
  );
  expect(global.fetch).not.toHaveBeenCalled();
});

test("returns a conflict without a model call when another durable lease is active", async () => {
  postDb({
    claimError: {
      code: "55P03",
      message: "A competitor analysis is already running for this client.",
    },
  });
  const fetchMock = global.fetch as jest.Mock;
  const response = await POST(request("POST", {
    client_id: CLIENT_ID,
    competitor_ids: [COMPETITOR_ID],
    window_days: 180,
  }), routeCtx);

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    code: "COMPETITOR_ANALYSIS_RUNNING",
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
