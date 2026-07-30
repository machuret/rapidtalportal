/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppliedStylePreview } from "@/components/content/AppliedStylePreview";
import { ContentPilotPanel } from "@/components/content/ContentPilotPanel";
import { api } from "@/lib/api-client";
import type { ContentProject } from "@/types/content";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
  },
}));

const apiMock = api as jest.Mocked<typeof api>;

function project(id: string, title: string, pieceId: string): ContentProject {
  return {
    id,
    client_id: "11111111-1111-4111-8111-111111111111",
    title,
    status: "approved",
    current_step: "complete",
    idea_snapshot: {
      version: 1,
      origin: "manual",
      title,
      channel: "linkedin",
      rationale: "",
      differentiation: "",
      evidenceSummary: "",
    },
    content_brief: {},
    vault_source_ids: [],
    vault_source_references: [],
    competitor_signals: [],
    style_snapshot: {},
    current_piece_id: pieceId,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders the real resolved channel voice and hard-rule provenance", () => {
  render(
    <AppliedStylePreview
      channel="linkedin"
      brandStyle={{
        brand_voice: "Warm, direct and commercially grounded.",
        channel_styles: { linkedin: "Use short paragraphs and a reflective closing question." },
        hard_rules: [{
          id: "no-hype",
          type: "prohibit_phrase",
          value: "game-changing",
          channels: ["linkedin"],
        }],
      }}
    />,
  );

  expect(screen.getByRole("region", { name: "Applied voice and style" })).toHaveTextContent(
    "Brand voice: Warm, direct and commercially grounded.",
  );
  expect(screen.getByRole("region", { name: "Applied voice and style" })).toHaveTextContent(
    "linkedin style: Use short paragraphs and a reflective closing question.",
  );
  expect(screen.getByText("1 additional hard rule")).toBeInTheDocument();
});

test("submits pilot feedback for the artifact selected by the reviewer", async () => {
  const first = project(
    "11111111-1111-4111-8111-111111111112",
    "First approved article",
    "21111111-1111-4111-8111-111111111112",
  );
  const second = project(
    "11111111-1111-4111-8111-111111111113",
    "Second approved article",
    "21111111-1111-4111-8111-111111111113",
  );
  apiMock.get.mockResolvedValue({
    enabled: true,
    workflow: {
      ideas_promoted: 2,
      briefs_reaching_drafts: 2,
      drafts_approved: 2,
      revisions: 1,
      validation_failures: 0,
      abandoned_total: 0,
    },
    analysis: {
      total_cost_usd: 1.25,
      running: [],
      failures: [],
    },
    voice_quality: {
      preference_rate: null,
      passing: false,
      decided_evaluations: 0,
    },
  });
  apiMock.post.mockResolvedValue({ id: "feedback-id" });

  const user = userEvent.setup();
  render(
    <ContentPilotPanel
      clientId="11111111-1111-4111-8111-111111111111"
      projects={[first, second]}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Review experience" }));
  await user.selectOptions(screen.getByLabelText("Artifact to review"), second.id);
  await user.click(screen.getByRole("button", { name: "Save review" }));

  await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
    "/api/content/pilot",
    expect.objectContaining({
      project_id: second.id,
      piece_id: second.current_piece_id,
    }),
  ));
});
