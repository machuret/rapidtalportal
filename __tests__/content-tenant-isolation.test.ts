/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/edge-proxy", () => ({ proxyToEdgeFunction: jest.fn() }));
jest.mock("@/lib/notifications", () => ({ notify: jest.fn() }));
jest.mock("@/lib/prompts/server", () => ({ renderPrompt: jest.fn() }));
jest.mock("@/lib/brain/context", () => ({ buildBrainContext: jest.fn() }));
jest.mock("@/lib/brain/embed", () => ({ embeddingFit: jest.fn() }));
jest.mock("@/lib/brain/events", () => ({ logBrainEvent: jest.fn() }));
jest.mock("@/lib/brain/llm", () => ({
  chatProvider: jest.fn(),
  chatModel: jest.fn(),
}));

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { POST as adapt } from "@/app/api/content/adapt/route";
import {
  DELETE as deleteCompetitor,
  GET as getCompetitors,
  PATCH as patchCompetitor,
  POST as createCompetitor,
} from "@/app/api/content/competitors/route";
import { POST as startCompetitorCrawl } from "@/app/api/content/competitors/crawl/route";
import { POST as advanceCompetitorCrawl } from "@/app/api/content/competitors/crawl/advance/route";
import { GET as getCompetitorItems } from "@/app/api/content/competitors/items/route";
import {
  GET as getCompetitorIntelligence,
  POST as createCompetitorIntelligence,
} from "@/app/api/content/competitors/intelligence/route";
import {
  DELETE as deleteCompetitorSource,
  PATCH as patchCompetitorSource,
  POST as createCompetitorSource,
} from "@/app/api/content/competitors/sources/route";
import { POST as duplicate } from "@/app/api/content/duplicate/route";
import { POST as generate } from "@/app/api/content/generate/route";
import {
  DELETE as deleteGolden,
  GET as getGoldens,
  PATCH as patchGolden,
  POST as createGolden,
} from "@/app/api/content/goldens/route";
import {
  GET as getPieces,
  PATCH as patchPiece,
  POST as createPiece,
} from "@/app/api/content/pieces/route";
import {
  GET as getProjects,
  PATCH as patchProject,
  POST as createProject,
} from "@/app/api/content/projects/route";
import { GET as getProjectEvidence } from "@/app/api/content/projects/evidence/route";
import { GET as revisions } from "@/app/api/content/revisions/route";
import { POST as rewrite } from "@/app/api/content/rewrite/route";
import {
  GET as getStyleAnalysis,
  PATCH as patchStyleAnalysis,
  POST as createStyleAnalysis,
} from "@/app/api/content/style-analysis/route";
import {
  GET as getVoiceEvaluations,
  PATCH as patchVoiceEvaluation,
  POST as createVoiceEvaluation,
} from "@/app/api/content/voice-evaluations/route";
import { POST as generateTopics } from "@/app/api/content/topics/generate/route";
import {
  DELETE as deleteTopic,
  GET as getTopics,
  PATCH as patchTopic,
  POST as createTopic,
} from "@/app/api/content/topics/route";
import { POST as validateContent } from "@/app/api/content/validate/route";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const PIECE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOPIC_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMPETITOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SOURCE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CRAWL_ID = "99999999-9999-4999-8999-999999999999";
const UPDATED_AT = "2026-07-28T01:00:00.000Z";
const STYLE_ANALYSIS_ID = "abababab-abab-4bab-8bab-abababababab";
const PROJECT_ID = "12121212-1212-4212-8212-121212121212";
const GOLDEN_ID = "13131313-1313-4313-8313-131313131313";
const EVALUATION_ID = "14141414-1414-4414-8414-141414141414";
const routeCtx = { params: Promise.resolve({}) };
const user: ApiUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  role: "client_admin",
  client_id: CLIENT_A,
};

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const cases: { endpoint: string; call: () => Promise<Response> }[] = [
  {
    endpoint: "adapt:POST",
    call: () => adapt(jsonRequest("https://portal.test/api/content/adapt", {
      client_id: CLIENT_B,
      id: PIECE_ID,
      target_type: "facebook",
    }), routeCtx),
  },
  {
    endpoint: "competitors:GET",
    call: () => getCompetitors(
      new NextRequest(`https://portal.test/api/content/competitors?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "competitors:POST",
    call: () => createCompetitor(jsonRequest("https://portal.test/api/content/competitors", {
      client_id: CLIENT_B,
      name: "Other tenant competitor",
      website_url: "https://example.com",
    }), routeCtx),
  },
  {
    endpoint: "competitors:PATCH",
    call: () => patchCompetitor(jsonRequest("https://portal.test/api/content/competitors", {
      client_id: CLIENT_B,
      id: COMPETITOR_ID,
      name: "Changed",
    }), routeCtx),
  },
  {
    endpoint: "competitors:DELETE",
    call: () => deleteCompetitor(jsonRequest("https://portal.test/api/content/competitors", {
      client_id: CLIENT_B,
      id: COMPETITOR_ID,
    }), routeCtx),
  },
  {
    endpoint: "competitors/sources:POST",
    call: () => createCompetitorSource(jsonRequest("https://portal.test/api/content/competitors/sources", {
      client_id: CLIENT_B,
      competitor_id: COMPETITOR_ID,
      url: "https://example.com/blog",
    }), routeCtx),
  },
  {
    endpoint: "competitors/sources:PATCH",
    call: () => patchCompetitorSource(jsonRequest("https://portal.test/api/content/competitors/sources", {
      client_id: CLIENT_B,
      id: SOURCE_ID,
      status: "paused",
    }), routeCtx),
  },
  {
    endpoint: "competitors/sources:DELETE",
    call: () => deleteCompetitorSource(jsonRequest("https://portal.test/api/content/competitors/sources", {
      client_id: CLIENT_B,
      id: SOURCE_ID,
    }), routeCtx),
  },
  {
    endpoint: "competitors/crawl:POST",
    call: () => startCompetitorCrawl(jsonRequest("https://portal.test/api/content/competitors/crawl", {
      client_id: CLIENT_B,
      source_id: SOURCE_ID,
    }), routeCtx),
  },
  {
    endpoint: "competitors/crawl/advance:POST",
    call: () => advanceCompetitorCrawl(jsonRequest("https://portal.test/api/content/competitors/crawl/advance", {
      client_id: CLIENT_B,
      job_id: CRAWL_ID,
    }), routeCtx),
  },
  {
    endpoint: "competitors/items:GET",
    call: () => getCompetitorItems(
      new NextRequest(
        `https://portal.test/api/content/competitors/items?client_id=${CLIENT_B}&competitor_id=${COMPETITOR_ID}`,
      ),
      routeCtx,
    ),
  },
  {
    endpoint: "competitors/intelligence:GET",
    call: () => getCompetitorIntelligence(
      new NextRequest(
        `https://portal.test/api/content/competitors/intelligence?client_id=${CLIENT_B}`,
      ),
      routeCtx,
    ),
  },
  {
    endpoint: "competitors/intelligence:POST",
    call: () => createCompetitorIntelligence(jsonRequest(
      "https://portal.test/api/content/competitors/intelligence",
      {
        client_id: CLIENT_B,
        competitor_ids: [COMPETITOR_ID],
        window_days: 180,
      },
    ), routeCtx),
  },
  {
    endpoint: "duplicate:POST",
    call: () => duplicate(jsonRequest("https://portal.test/api/content/duplicate", {
      client_id: CLIENT_B,
      id: PIECE_ID,
    }), routeCtx),
  },
  {
    endpoint: "generate:POST",
    call: () => generate(jsonRequest("https://portal.test/api/content/generate", {
      clientId: CLIENT_B,
      contentType: "linkedin",
      title: "Cross-tenant request",
      brief: {
        version: 1,
        objective: "Create another tenant's content",
        tone: "professional",
        length: "short",
      },
    })),
  },
  {
    endpoint: "goldens:GET",
    call: () => getGoldens(
      new NextRequest(`https://portal.test/api/content/goldens?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "goldens:POST",
    call: () => createGolden(jsonRequest("https://portal.test/api/content/goldens", {
      client_id: CLIENT_B,
      channel: "linkedin",
      title: "Published example",
      body: "A sufficiently detailed published example for another tenant’s private voice library.",
      content_type: "educational",
      evaluation_permission: true,
    }), routeCtx),
  },
  {
    endpoint: "goldens:PATCH",
    call: () => patchGolden(jsonRequest("https://portal.test/api/content/goldens", {
      client_id: CLIENT_B,
      id: GOLDEN_ID,
      title: "Changed",
      expected_updated_at: UPDATED_AT,
    }), routeCtx),
  },
  {
    endpoint: "goldens:DELETE",
    call: () => deleteGolden(jsonRequest("https://portal.test/api/content/goldens", {
      client_id: CLIENT_B,
      id: GOLDEN_ID,
      expected_updated_at: UPDATED_AT,
    }), routeCtx),
  },
  {
    endpoint: "pieces:GET",
    call: () => getPieces(
      new NextRequest(`https://portal.test/api/content/pieces?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "pieces:POST",
    call: () => createPiece(jsonRequest("https://portal.test/api/content/pieces", {
      client_id: CLIENT_B,
      content_type: "linkedin",
      title: "Cross-tenant draft",
    }), routeCtx),
  },
  {
    endpoint: "pieces:PATCH",
    call: () => patchPiece(jsonRequest("https://portal.test/api/content/pieces", {
      client_id: CLIENT_B,
      id: PIECE_ID,
      body: "Cross-tenant edit",
    }), routeCtx),
  },
  {
    endpoint: "projects:GET",
    call: () => getProjects(
      new NextRequest(`https://portal.test/api/content/projects?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "projects:POST",
    call: () => createProject(jsonRequest("https://portal.test/api/content/projects", {
      client_id: CLIENT_B,
      idea: {
        version: 1,
        origin: "manual",
        title: "Cross-tenant project",
        channel: "linkedin",
        rationale: "",
        differentiation: "",
        evidenceSummary: "",
      },
    }), routeCtx),
  },
  {
    endpoint: "projects:PATCH",
    call: () => patchProject(jsonRequest("https://portal.test/api/content/projects", {
      client_id: CLIENT_B,
      id: PROJECT_ID,
      expected_updated_at: UPDATED_AT,
      current_step: "brief",
    }), routeCtx),
  },
  {
    endpoint: "projects/evidence:GET",
    call: () => getProjectEvidence(
      new NextRequest(
        `https://portal.test/api/content/projects/evidence?client_id=${CLIENT_B}&project_id=${PROJECT_ID}`,
      ),
      routeCtx,
    ),
  },
  {
    endpoint: "revisions:GET",
    call: () => revisions(
      new NextRequest(
        `https://portal.test/api/content/revisions?client_id=${CLIENT_B}&piece_id=${PIECE_ID}`,
      ),
      routeCtx,
    ),
  },
  {
    endpoint: "rewrite:POST",
    call: () => rewrite(jsonRequest("https://portal.test/api/content/rewrite", {
      client_id: CLIENT_B,
      id: PIECE_ID,
      scope: "full",
      instruction: "Cross-tenant rewrite",
      expected_updated_at: UPDATED_AT,
    }), routeCtx),
  },
  {
    endpoint: "style-analysis:GET",
    call: () => getStyleAnalysis(
      new NextRequest(`https://portal.test/api/content/style-analysis?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "style-analysis:POST",
    call: () => createStyleAnalysis(jsonRequest("https://portal.test/api/content/style-analysis", {
      client_id: CLIENT_B,
      channel: "linkedin",
      expected_updated_at: null,
    }), routeCtx),
  },
  {
    endpoint: "style-analysis:PATCH",
    call: () => patchStyleAnalysis(jsonRequest("https://portal.test/api/content/style-analysis", {
      client_id: CLIENT_B,
      id: STYLE_ANALYSIS_ID,
      action: "save",
      analysis: {
        summary: "Clear and practical.",
        voice_traits: [],
        tone: "Professional",
        audience_relationship: "",
        hook_patterns: [],
        structure_patterns: [],
        sentence_style: "",
        paragraph_style: "",
        formatting_patterns: [],
        vocabulary_patterns: [],
        cta_patterns: [],
        emoji_usage: "",
        hashtag_usage: "",
        content_patterns: [],
        avoid_patterns: [],
        schema_version: 1,
        confidence: "medium",
        evidence: [
          {
            source_item_id: "55555555-5555-4555-8555-555555555555",
            observations: ["Direct opening."],
          },
          {
            source_item_id: "66666666-6666-4666-8666-666666666666",
            observations: ["Short paragraphs."],
          },
        ],
      },
      expected_updated_at: "2026-07-29T01:00:00.000Z",
    }), routeCtx),
  },
  {
    endpoint: "topics/generate:POST",
    call: () => generateTopics(jsonRequest("https://portal.test/api/content/topics/generate", {
      client_id: CLIENT_B,
      count: 3,
    }), routeCtx),
  },
  {
    endpoint: "topics:GET",
    call: () => getTopics(
      new NextRequest(`https://portal.test/api/content/topics?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "topics:POST",
    call: () => createTopic(jsonRequest("https://portal.test/api/content/topics", {
      client_id: CLIENT_B,
      title: "Cross-tenant topic",
      content_type: "linkedin",
    }), routeCtx),
  },
  {
    endpoint: "topics:PATCH",
    call: () => patchTopic(jsonRequest("https://portal.test/api/content/topics", {
      client_id: CLIENT_B,
      id: TOPIC_ID,
      status: "approved",
    }), routeCtx),
  },
  {
    endpoint: "topics:DELETE",
    call: () => deleteTopic(jsonRequest("https://portal.test/api/content/topics", {
      client_id: CLIENT_B,
      id: TOPIC_ID,
    }), routeCtx),
  },
  {
    endpoint: "validate:POST",
    call: () => validateContent(jsonRequest("https://portal.test/api/content/validate", {
      client_id: CLIENT_B,
      project_id: PROJECT_ID,
      piece_id: PIECE_ID,
    }), routeCtx),
  },
  {
    endpoint: "voice-evaluations:GET",
    call: () => getVoiceEvaluations(
      new NextRequest(`https://portal.test/api/content/voice-evaluations?client_id=${CLIENT_B}`),
      routeCtx,
    ),
  },
  {
    endpoint: "voice-evaluations:POST",
    call: () => createVoiceEvaluation(jsonRequest("https://portal.test/api/content/voice-evaluations", {
      client_id: CLIENT_B,
      channel: "linkedin",
      title: "Cross-tenant evaluation",
      objective: "Create a private voice comparison for another tenant.",
      audience: "Business owners",
    }), routeCtx),
  },
  {
    endpoint: "voice-evaluations:PATCH",
    call: () => patchVoiceEvaluation(jsonRequest("https://portal.test/api/content/voice-evaluations", {
      client_id: CLIENT_B,
      id: EVALUATION_ID,
      preferred_variant: "a",
      reviewer_notes: "",
    }), routeCtx),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({ user });
});

describe("all content endpoint tenant boundaries", () => {
  test("the registry covers every exported content route handler", () => {
    const root = path.resolve(__dirname, "..", "app", "api", "content");
    const filesUnder = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const absolute = path.join(directory, name);
        return statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
      });
    const routeFiles = filesUnder(root)
      .filter((file) => file.endsWith(`${path.sep}route.ts`))
      .map((file) => path.relative(root, file));
    const discovered = routeFiles.flatMap((file) => {
      const source = readFileSync(path.join(root, file), "utf8");
      const methods = Array.from(
        source.matchAll(/export\s+(?:const|async function)\s+(GET|POST|PATCH|DELETE)\b/gu),
        (match) => match[1],
      );
      const routeName = file.replace(/\/route\.ts$/u, "").replace(/route\.ts$/u, "").replace(/\/$/u, "");
      return methods.map((method) => `${routeName}:${method}`);
    }).sort();

    expect(cases.map((entry) => entry.endpoint).sort()).toEqual(discovered);
  });

  test.each(cases)("$endpoint rejects another tenant before privileged work", async ({ call }) => {
    const response = await call();

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(proxyToEdgeFunction).not.toHaveBeenCalled();
  });
});
