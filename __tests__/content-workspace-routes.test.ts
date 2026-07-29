/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/edge-proxy", () => ({ proxyToEdgeFunction: jest.fn() }));

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { POST as rewrite } from "@/app/api/content/rewrite/route";
import { POST as adapt } from "@/app/api/content/adapt/route";
import { POST as duplicate } from "@/app/api/content/duplicate/route";
import { GET as revisions } from "@/app/api/content/revisions/route";
import { POST as generate } from "@/app/api/content/generate/route";

type DbError = { code: string; message: string } | null;
type DbResult = { data: unknown; error: DbError };

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const PIECE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CHILD_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPDATED_AT = "2026-07-28T01:00:00.000Z";
const NEXT_UPDATED_AT = "2026-07-28T01:01:00.000Z";
const routeCtx = { params: Promise.resolve({}) };

const apiUser: ApiUser = { id: USER_ID, role: "va", client_id: CLIENT_A };
const jsonReq = (body: unknown) => ({ json: async () => body }) as never;

function chain(result: DbResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "eq", "order", "limit"]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({ user: apiUser });
});

describe("unified content generation boundary", () => {
  test("validates and forwards one structured platform brief", async () => {
    (proxyToEdgeFunction as jest.Mock).mockResolvedValue(NextResponse.json({
      id: CHILD_ID,
      body: "Draft",
      updatedAt: NEXT_UPDATED_AT,
    }));
    const request = new NextRequest("https://portal.test/api/content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_A,
        contentType: "linkedin",
        title: "Launch",
        brief: {
          version: 1,
          objective: "Announce the launch",
          audience: "Customers",
          keyPoints: ["One artifact"],
          callToAction: "Book a call",
          tone: "professional",
          length: "short",
        },
      }),
    });

    const response = await generate(request);

    expect(response.status).toBe(200);
    expect(proxyToEdgeFunction).toHaveBeenCalledWith("content-generate", expect.objectContaining({
      contentType: "linkedin",
      brief: expect.objectContaining({
        audience: "Customers",
        callToAction: "Book a call",
      }),
    }));
  });

  test("accepts immutable intelligence timestamps with database offsets", async () => {
    (proxyToEdgeFunction as jest.Mock).mockResolvedValue(NextResponse.json({
      id: CHILD_ID,
      body: "Draft",
      updatedAt: NEXT_UPDATED_AT,
    }));
    const request = new NextRequest("https://portal.test/api/content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_A,
        contentType: "linkedin",
        title: "Evidence-backed idea",
        brief: {
          version: 1,
          objective: "Use a verified market opportunity.",
          tone: "professional",
          length: "short",
          marketIntelligence: {
            version: 1,
            runId: "30000000-0000-4000-8000-000000000001",
            reportSchemaVersion: 2,
            ideaTitle: "Evidence-backed idea",
            confidence: "medium",
            novelty: "adjacent",
            competitorIds: ["33333333-3333-4333-8333-333333333333"],
            competitorSources: [1, 2].map((number) => ({
              itemId: `00000000-0000-4000-8000-00000000000${number}`,
              captureVersionId: `10000000-0000-4000-8000-00000000000${number}`,
              contentHash: `hash-${number}-0000000000000000`,
              competitorId: "33333333-3333-4333-8333-333333333333",
              competitorName: "Market Co",
              title: `Post ${number}`,
              url: `https://competitor.test/${number}`,
              effectiveAt: "2026-07-01T10:00:00+10:00",
              dateBasis: "published",
              evidenceQuote: "A sufficiently long exact competitor evidence quotation.",
            })),
            companyReferences: [],
            generatedAt: "2026-07-01T10:00:00+10:00",
          },
        },
      }),
    });

    const response = await generate(request);

    expect(response.status).toBe(200);
    expect(proxyToEdgeFunction).toHaveBeenCalledWith(
      "content-generate",
      expect.objectContaining({
        brief: expect.objectContaining({
          marketIntelligence: expect.objectContaining({
            generatedAt: "2026-07-01T10:00:00+10:00",
          }),
        }),
      }),
    );
  });

  test("rejects the legacy combined social type at the web boundary", async () => {
    const request = new NextRequest("https://portal.test/api/content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_A,
        contentType: "social",
        title: "Launch",
        brief: "Announce it",
      }),
    });

    const response = await generate(request);

    expect(response.status).toBe(422);
    expect(proxyToEdgeFunction).not.toHaveBeenCalled();
  });
});

describe("content rewrite route", () => {
  const piece = {
    id: PIECE_ID,
    content_type: "linkedin",
    title: "Launch",
    body: "Repeat this. Keep this. Repeat this.",
    status: "draft",
    content_brief: {
      version: 1,
      objective: "Original objective",
      tone: "professional",
      length: "medium",
    },
    source_references: [{ itemId: "source-old", title: "Original", kind: "vault_item" }],
    updated_at: UPDATED_AT,
  };

  function adminWithRpc(rpcResult: DbResult) {
    return {
      from: jest.fn(() => chain({ data: piece, error: null })),
      rpc: jest.fn(() => chain(rpcResult)),
    };
  }

  test("commits an exact second-occurrence section rewrite with optimistic locking", async () => {
    const updated = {
      ...piece,
      body: "Repeat this. Keep this. Replacement.",
      content_brief: { ...piece.content_brief, objective: "Make it clearer" },
      source_references: [
        piece.source_references[0],
        { itemId: "source-new", title: "New", kind: "semantic" },
      ],
      updated_at: NEXT_UPDATED_AT,
    };
    const admin = adminWithRpc({ data: updated, error: null });
    (createAdminClient as jest.Mock).mockReturnValue(admin);
    (proxyToEdgeFunction as jest.Mock).mockResolvedValue(NextResponse.json({
      body: "Replacement.",
      sources: [{ itemId: "source-new", title: "New", kind: "semantic" }],
      styleSnapshot: { channel: "linkedin" },
    }));

    const response = await rewrite(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      scope: "section",
      instruction: "Make it clearer",
      expected_updated_at: UPDATED_AT,
      selectedText: "Repeat this.",
      selectionStart: 24,
      selectionEnd: 36,
    }), routeCtx);

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("commit_content_piece_rewrite", expect.objectContaining({
      p_expected_updated_at: UPDATED_AT,
      p_body: "Repeat this. Keep this. Replacement.",
      p_content_brief: expect.objectContaining({ objective: "Make it clearer" }),
      p_source_references: expect.arrayContaining([
        expect.objectContaining({ itemId: "source-old" }),
        expect.objectContaining({ itemId: "source-new" }),
      ]),
    }));
  });

  test("maps a concurrent editorial update to HTTP 409", async () => {
    const admin = adminWithRpc({
      data: null,
      error: { code: "40001", message: "Content changed while the rewrite was running." },
    });
    (createAdminClient as jest.Mock).mockReturnValue(admin);
    (proxyToEdgeFunction as jest.Mock).mockResolvedValue(NextResponse.json({
      body: "Rewritten draft",
      sources: [],
      styleSnapshot: {},
    }));

    const response = await rewrite(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      scope: "full",
      instruction: "Make it shorter",
      expected_updated_at: UPDATED_AT,
    }), routeCtx);

    expect(response.status).toBe(409);
  });

  test("rejects cross-tenant rewrites before database or model access", async () => {
    const admin = adminWithRpc({ data: null, error: null });
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await rewrite(jsonReq({
      client_id: CLIENT_B,
      id: PIECE_ID,
      scope: "full",
      instruction: "Rewrite",
      expected_updated_at: UPDATED_AT,
    }), routeCtx);

    expect(response.status).toBe(403);
    expect(admin.from).not.toHaveBeenCalled();
    expect(proxyToEdgeFunction).not.toHaveBeenCalled();
  });
});

describe("content adaptation route", () => {
  test("passes lineage into the initial generation insert and performs no second update", async () => {
    const admin = {
      from: jest.fn(() => chain({
        data: {
          title: "Source",
          body: "A long source body",
          content_brief: { version: 1, objective: "Explain it", tone: "friendly", length: "long" },
        },
        error: null,
      })),
    };
    (createAdminClient as jest.Mock).mockReturnValue(admin);
    const created = {
      id: CHILD_ID,
      content_type: "facebook",
      title: "Source — facebook",
      status: "draft",
      generation_kind: "adaptation",
      parent_piece_id: PIECE_ID,
      created_at: NEXT_UPDATED_AT,
    };
    (proxyToEdgeFunction as jest.Mock).mockResolvedValue(NextResponse.json({
      id: CHILD_ID,
      piece: created,
    }));

    const response = await adapt(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      target_type: "facebook",
    }), routeCtx);

    expect(response.status).toBe(201);
    expect(proxyToEdgeFunction).toHaveBeenCalledWith("content-generate", expect.objectContaining({
      sourceContext: "A long source body",
      parentPieceId: PIECE_ID,
      generationKind: "adaptation",
    }));
    expect(admin.from).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject(created);
  });
});

describe("duplicate and revision tenant boundaries", () => {
  test("duplicates provenance and lineage in one insert", async () => {
    const source = {
      content_type: "linkedin",
      title: "Source",
      brief: "Brief",
      body: "Body",
      content_brief: { version: 1 },
      source_references: [],
      style_snapshot: {},
    };
    const sourceBuilder = chain({ data: source, error: null });
    const insertBuilder = chain({
      data: {
        id: CHILD_ID,
        content_type: "linkedin",
        title: "Copy of Source",
        status: "draft",
        generation_kind: "duplicate",
        parent_piece_id: PIECE_ID,
        created_at: NEXT_UPDATED_AT,
      },
      error: null,
    });
    const admin = {
      from: jest.fn()
        .mockReturnValueOnce(sourceBuilder)
        .mockReturnValueOnce(insertBuilder),
    };
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await duplicate(jsonReq({ client_id: CLIENT_A, id: PIECE_ID }), routeCtx);

    expect(response.status).toBe(201);
    expect((insertBuilder.insert as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining({
      parent_piece_id: PIECE_ID,
      generation_kind: "duplicate",
      content_brief: source.content_brief,
    }));
  });

  test("revision reads always qualify both piece and tenant", async () => {
    const builder = chain({ data: [], error: null });
    const admin = { from: jest.fn(() => builder) };
    (createAdminClient as jest.Mock).mockReturnValue(admin);
    const request = {
      url: `https://portal.test/api/content/revisions?client_id=${CLIENT_A}&piece_id=${PIECE_ID}`,
    } as never;

    const response = await revisions(request, routeCtx);

    expect(response.status).toBe(200);
    expect(builder.eq).toHaveBeenCalledWith("piece_id", PIECE_ID);
    expect(builder.eq).toHaveBeenCalledWith("client_id", CLIENT_A);
  });
});
