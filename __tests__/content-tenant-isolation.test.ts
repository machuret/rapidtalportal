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
import { POST as duplicate } from "@/app/api/content/duplicate/route";
import { POST as generate } from "@/app/api/content/generate/route";
import {
  GET as getPieces,
  PATCH as patchPiece,
  POST as createPiece,
} from "@/app/api/content/pieces/route";
import { GET as revisions } from "@/app/api/content/revisions/route";
import { POST as rewrite } from "@/app/api/content/rewrite/route";
import { POST as generateTopics } from "@/app/api/content/topics/generate/route";
import {
  DELETE as deleteTopic,
  GET as getTopics,
  PATCH as patchTopic,
  POST as createTopic,
} from "@/app/api/content/topics/route";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const PIECE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOPIC_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UPDATED_AT = "2026-07-28T01:00:00.000Z";
const routeCtx = { params: Promise.resolve({}) };
const user: ApiUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  role: "va",
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
