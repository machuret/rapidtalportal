/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});
jest.mock("@/lib/notifications", () => ({ notify: jest.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { PATCH, POST } from "@/app/api/content/pieces/route";

type DbResult = { data: unknown; error: null | { code: string; message: string } };

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const PIECE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UPDATED_AT = "2026-07-28T01:00:00.000Z";
const DNA_UPDATED_AT = "2026-07-28T00:00:00.000Z";
const routeCtx = { params: Promise.resolve({}) };

const user = (role: ApiUser["role"] = "va"): ApiUser => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  role,
  client_id: CLIENT_A,
});
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

function makeAdmin(options?: {
  piece?: DbResult;
  dna?: DbResult;
  rpc?: DbResult;
}) {
  const defaults = {
    piece: {
      data: {
        id: PIECE_ID,
        client_id: CLIENT_A,
        content_type: "linkedin",
        title: "Draft",
        body: "A useful practical update.",
        status: "draft",
        updated_at: UPDATED_AT,
        created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      error: null,
    } satisfies DbResult,
    dna: {
      data: {
        updated_at: DNA_UPDATED_AT,
        internal_rules: "Be accurate.",
        prohibited_terms: "cheap",
        prohibited_claims: "guaranteed results",
        brand_voice: "Practical and calm.",
        emoji_policy: "No emojis",
        channel_styles: { linkedin: "Short paragraphs." },
      },
      error: null,
    } satisfies DbResult,
    rpc: {
      data: {
        id: PIECE_ID,
        content_type: "linkedin",
        title: "Draft",
        body: "A useful practical update.",
        status: "approved",
        style_snapshot: {},
        created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        created_at: UPDATED_AT,
        updated_at: UPDATED_AT,
      },
      error: null,
    } satisfies DbResult,
    ...options,
  };

  return {
    from: jest.fn((table: string) =>
      chain(table === "company_dna" ? defaults.dna : defaults.piece)),
    rpc: jest.fn(() => chain(defaults.rpc)),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireApiAuth as jest.Mock).mockResolvedValue({ user: user() });
});

describe("content piece integrity", () => {
  test("blocks cross-tenant updates before touching the database", async () => {
    const admin = makeAdmin();
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await PATCH(jsonReq({
      client_id: CLIENT_B,
      id: PIECE_ID,
      body: "Cross-tenant edit",
    }), routeCtx);

    expect(response.status).toBe(403);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test("blocks deterministic Company DNA violations before approval", async () => {
    const admin = makeAdmin({
      piece: {
        data: {
          id: PIECE_ID,
          content_type: "linkedin",
          body: "Our cheap offer guarantees guaranteed results.",
          status: "draft",
          updated_at: UPDATED_AT,
        },
        error: null,
      },
    });
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await PATCH(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      status: "approved",
    }), routeCtx);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      warnings: expect.arrayContaining([
        "Review prohibited phrase: “cheap”",
        "Review prohibited phrase: “guaranteed results”",
      ]),
    });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test("approves through the atomic RPC with exact piece and DNA versions", async () => {
    const admin = makeAdmin();
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await PATCH(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      status: "approved",
    }), routeCtx);

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("update_content_piece_atomic", expect.objectContaining({
      p_expected_piece_updated_at: UPDATED_AT,
      p_expected_dna_updated_at: DNA_UPDATED_AT,
      p_style_snapshot: expect.objectContaining({
        channel: "linkedin",
        companyDnaUpdatedAt: DNA_UPDATED_AT,
      }),
    }));
  });

  test("maps stale review conflicts to HTTP 409", async () => {
    const admin = makeAdmin({
      rpc: {
        data: null,
        error: { code: "40001", message: "Content changed while it was being reviewed." },
      },
    });
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await PATCH(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      status: "archived",
    }), routeCtx);

    expect(response.status).toBe(409);
  });

  test("uses the editor's expected version instead of silently rebasing a stale save", async () => {
    const admin = makeAdmin();
    (createAdminClient as jest.Mock).mockReturnValue(admin);
    const editorVersion = "2026-07-28T00:59:00.000Z";

    const response = await PATCH(jsonReq({
      client_id: CLIENT_A,
      id: PIECE_ID,
      body: "Edited body",
      expected_updated_at: editorVersion,
    }), routeCtx);

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("update_content_piece_atomic", expect.objectContaining({
      p_expected_piece_updated_at: editorVersion,
    }));
  });

  test("accepts X drafts and records a style snapshot", async () => {
    const admin = makeAdmin({
      piece: {
        data: {
          id: PIECE_ID,
          content_type: "x",
          title: "X draft",
          status: "draft",
          created_at: UPDATED_AT,
        },
        error: null,
      },
    });
    (createAdminClient as jest.Mock).mockReturnValue(admin);

    const response = await POST(jsonReq({
      client_id: CLIENT_A,
      content_type: "x",
      title: "X draft",
      body: "One concise update.",
    }), routeCtx);

    expect(response.status).toBe(201);
    const contentBuilder = admin.from.mock.results[1].value as { insert: jest.Mock };
    expect(contentBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      content_type: "x",
      style_snapshot: expect.objectContaining({
        channel: "x",
        companyDnaUpdatedAt: DNA_UPDATED_AT,
      }),
    }));
  });
});
