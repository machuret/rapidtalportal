/** @jest-environment node */

import { api } from "@/lib/api-client";
import { generateQuickDraft } from "@/lib/content/quick-draft";
import type { ContentBrief, ContentPiece, ContentProject } from "@/types/content";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PIECE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_ID = "44444444-4444-4444-8444-444444444444";

const brief: ContentBrief = {
  version: 1,
  objective: "Explain a useful company topic",
  tone: "professional",
  length: "medium",
  mode: "new",
};

function project(
  current_step: ContentProject["current_step"],
  updated_at: string,
  overrides: Partial<ContentProject> = {},
): ContentProject {
  return {
    id: PROJECT_ID,
    client_id: CLIENT_ID,
    title: "A useful company topic",
    status: "active",
    current_step,
    idea_snapshot: {
      version: 1,
      origin: "manual",
      title: "A useful company topic",
      channel: "linkedin",
      rationale: "",
      differentiation: "",
      evidenceSummary: "",
    },
    content_brief: current_step === "idea" ? {} : brief,
    vault_source_ids: [],
    vault_source_references: [],
    competitor_signals: [],
    style_snapshot: {},
    current_piece_id: null,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at,
    ...overrides,
  };
}

describe("quick content draft orchestration", () => {
  beforeEach(() => jest.clearAllMocks());

  test("uses every guarded transition before generation", async () => {
    const idea = project("idea", "2026-07-30T00:00:00.000Z");
    const briefProject = project("brief", "2026-07-30T00:00:01.000Z");
    const evidenceProject = project("evidence", "2026-07-30T00:00:02.000Z");
    const generateProject = project("generate", "2026-07-30T00:00:03.000Z", {
      vault_source_ids: [SOURCE_ID],
    });
    const piece: ContentPiece = {
      id: PIECE_ID,
      project_id: PROJECT_ID,
      content_type: "linkedin",
      title: idea.title,
      body: "Generated draft",
      status: "draft",
      created_at: "2026-07-30T00:00:04.000Z",
    };
    const loaded = project("edit", "2026-07-30T00:00:04.000Z", {
      current_piece_id: PIECE_ID,
      current_piece: piece,
      vault_source_ids: [SOURCE_ID],
    });

    (api.patch as jest.Mock)
      .mockResolvedValueOnce(briefProject)
      .mockResolvedValueOnce(evidenceProject)
      .mockResolvedValueOnce(generateProject);
    (api.get as jest.Mock)
      .mockResolvedValueOnce([{
        id: SOURCE_ID,
        title: "Company source",
        excerpt: "Useful evidence",
        category: "general",
        sourceUrl: null,
      }])
      .mockResolvedValueOnce(loaded);
    (api.post as jest.Mock).mockResolvedValue({
      id: PIECE_ID,
      body: "Generated draft",
    });

    const result = await generateQuickDraft({
      clientId: CLIENT_ID,
      project: idea,
      brief,
    });

    expect((api.patch as jest.Mock).mock.calls.map((call) => call[1].current_step))
      .toEqual(["brief", "evidence", "generate"]);
    expect(api.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        projectId: PROJECT_ID,
        vaultSourceIds: [SOURCE_ID],
        brief,
      }),
      { showErrorToast: false },
    );
    expect(result).toEqual({ project: loaded, piece });
  });

  test("preserves an editor's existing evidence selection when resuming", async () => {
    const evidenceProject = project("evidence", "2026-07-30T00:00:02.000Z", {
      vault_source_ids: [SOURCE_ID],
    });
    const generateProject = project("generate", "2026-07-30T00:00:03.000Z", {
      vault_source_ids: [SOURCE_ID],
    });
    const loaded = project("edit", "2026-07-30T00:00:04.000Z", {
      current_piece_id: PIECE_ID,
    });
    (api.get as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(loaded);
    (api.patch as jest.Mock).mockResolvedValueOnce(generateProject);
    (api.post as jest.Mock).mockResolvedValue({
      id: PIECE_ID,
      body: "Generated draft",
    });

    await generateQuickDraft({
      clientId: CLIENT_ID,
      project: evidenceProject,
      brief,
    });

    expect(api.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ vault_source_ids: [SOURCE_ID] }),
      { showErrorToast: false },
    );
  });
});
