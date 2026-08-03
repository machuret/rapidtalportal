/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api-client";
import { QuickDraftPage } from "@/components/content/QuickDraftPage";
import { ProjectsPage } from "@/components/content/ProjectsPage";
import type { ContentPiece, ContentProject, ContentTopic } from "@/types/content";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));
jest.mock("@/components/content/ContentProjectWorkflow", () => ({
  ContentProjectWorkflow: () => <div>Draft editor</div>,
}));
jest.mock("@/components/content/AppliedStylePreview", () => ({
  AppliedStylePreview: ({ channel }: { channel: string }) => <div>Style for {channel}</div>,
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PIECE_ID = "33333333-3333-4333-8333-333333333333";

function project(current_step: ContentProject["current_step"]): ContentProject {
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
    content_brief: {},
    vault_source_ids: [],
    vault_source_references: [],
    competitor_signals: [],
    style_snapshot: {},
    current_piece_id: current_step === "edit" ? PIECE_ID : null,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
  };
}

describe("Quick Draft page", () => {
  beforeEach(() => jest.clearAllMocks());

  test("creates and opens a draft from three lightweight controls", async () => {
    const user = userEvent.setup();
    const created = project("idea");
    const ready = project("edit");
    const piece: ContentPiece = {
      id: PIECE_ID,
      project_id: PROJECT_ID,
      content_type: "linkedin",
      title: created.title,
      body: "Generated draft",
      status: "draft",
      created_at: "2026-07-30T00:00:01.000Z",
    };
    (api.post as jest.Mock).mockResolvedValue({ project: ready, piece });

    render(
      <QuickDraftPage
        clientId={CLIENT_ID}
        canApprove
        brandStyle={{}}
        onboardingMode
      />,
    );

    expect(screen.getByText("Step 5 of 6")).toBeInTheDocument();
    expect(screen.getByText("Create a draft in under a minute")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Content topic"), "A useful company topic");
    await user.type(screen.getByLabelText("Optional content direction"), "Write for property investors");
    await user.click(screen.getByRole("button", { name: "Generate draft" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/content/quick-draft",
      expect.objectContaining({
        clientId: CLIENT_ID,
        idempotencyKey: expect.any(String),
        title: "A useful company topic",
        contentType: "linkedin",
        guidance: "Write for property investors",
      }),
      expect.objectContaining({ idempotent: true, showErrorToast: false }),
    ));
    expect(screen.getByText("Draft editor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue your journey/i })).toHaveAttribute("href", "/dashboard");
  });
});

describe("Projects page", () => {
  beforeEach(() => jest.clearAllMocks());

  test("removes an abandoned project from unfinished work without deleting its drafts", async () => {
    const user = userEvent.setup();
    const unfinished = project("brief");
    const archived = {
      ...unfinished,
      status: "rejected" as const,
      current_step: "complete" as const,
      updated_at: "2026-07-30T00:01:00.000Z",
    };
    jest.spyOn(window, "confirm").mockReturnValue(true);
    (api.patch as jest.Mock).mockResolvedValue(archived);

    render(
      <ProjectsPage
        clientId={CLIENT_ID}
        canApprove
        brandStyle={{}}
        initialProjects={[unfinished]}
        projectsHasMore={false}
        initialTopics={[]}
      />,
    );

    await user.click(screen.getByRole("button", {
      name: "Remove A useful company topic from unfinished projects",
    }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        client_id: CLIENT_ID,
        id: PROJECT_ID,
        status: "rejected",
        current_step: "complete",
      }),
    ));
    expect(screen.queryByRole("button", {
      name: "Remove A useful company topic from unfinished projects",
    })).not.toBeInTheDocument();
  });

  test("keeps every approved idea discoverable instead of permanently hiding ideas after twelve", async () => {
    const user = userEvent.setup();
    const topics: ContentTopic[] = Array.from({ length: 14 }, (_, index) => ({
      id: `topic-${index + 1}`,
      title: `Approved idea ${index + 1}`,
      description: `Useful idea number ${index + 1}`,
      content_type: "linkedin",
      status: "approved",
      created_at: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      created_by: null,
    }));

    render(
      <ProjectsPage
        clientId={CLIENT_ID}
        canApprove
        brandStyle={{}}
        initialProjects={[]}
        projectsHasMore={false}
        initialTopics={topics}
      />,
    );

    expect(screen.getByText("Approved idea 12")).toBeVisible();
    expect(screen.queryByText("Approved idea 14")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View all 14 approved ideas" }));
    expect(screen.getByText("Approved idea 14")).toBeVisible();
    await user.clear(screen.getByPlaceholderText("Search approved ideas"));
    await user.type(screen.getByPlaceholderText("Search approved ideas"), "idea 14");
    expect(screen.getByText("Approved idea 14")).toBeVisible();
  });
});
