/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api-client";
import { VaultReadinessDashboard } from "@/components/vault/VaultReadinessDashboard";
import type { VaultReadiness } from "@/lib/vault/readiness";

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn() },
}));
jest.mock("@/components/vault/KnowledgeGaps", () => ({
  KnowledgeGaps: ({ gaps }: { gaps: Array<{ id: string; question: string }> }) => (
    <div>{gaps.map((gap) => <p key={gap.id}>{gap.question}</p>)}</div>
  ),
}));

const readiness: VaultReadiness = {
  score: 72,
  status: "developing",
  label: "Developing",
  summary: "Important knowledge is still missing.",
  metrics: {
    total: 8,
    ready: 7,
    processing: 1,
    stuckProcessing: 0,
    failed: 0,
    searchable: 6,
    stale: 2,
    authoritative: 2,
    supporting: 5,
    reviewRequired: 0,
    superseded: 1,
    expired: 0,
    conflicted: 0,
    timeSensitive: 1,
    openGaps: 1,
    questionsTested: 6,
  },
  categoryCounts: {
    service: 2,
    contact: 0,
    process: 2,
    policy: 0,
    reference: 3,
    general: 0,
  },
  missingCoreCategories: ["policy"],
  gaps: ["What is the approval policy?"],
  knowledgeGaps: [{
    id: "gap-1",
    question: "What is the approval policy?",
    status: "open",
    importance: "high",
    ownerId: null,
    ownerName: null,
    recommendedSource: "Current approvals policy",
    occurrences: 2,
    createdAt: "2026-07-20T00:00:00.000Z",
  }],
  topics: [{
    topic: "approvals",
    sourceCount: 2,
    authoritativeCount: 1,
    strength: "moderate",
    lastUpdatedAt: "2026-07-20T00:00:00.000Z",
  }],
  thinTopics: [],
  attentionSources: [],
  recommendations: [
    {
      id: "coverage",
      title: "Add one missing knowledge area",
      detail: "Coverage is missing: policy.",
      action: "add",
      priority: "medium",
    },
    {
      id: "gaps",
      title: "Answer one open knowledge gap",
      detail: "This is a real unanswered question.",
      action: "gaps",
      priority: "medium",
    },
  ],
  freshnessWindowDays: 365,
};

describe("Vault readiness dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockResolvedValue(readiness);
    Element.prototype.scrollIntoView = jest.fn();
  });

  test("shows readiness, coverage and direct recovery actions", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();

    render(
      <VaultReadinessDashboard
        clientId="11111111-1111-4111-8111-111111111111"
        canCurate
        canIndex
        version="1"
        onAdd={onAdd}
        onIndex={jest.fn()}
      />,
    );

    expect(await screen.findByText("Knowledge readiness")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("Policy: 0 · missing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add knowledge" }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => {
      expect(screen.getByText("What is the approval policy?")).toBeInTheDocument();
    });
  });

  test("identifies blocked sources and reports the result of Fix now", async () => {
    const user = userEvent.setup();
    const blocked: VaultReadiness = {
      ...readiness,
      status: "needs_attention",
      recommendations: [{
        id: "unsearchable",
        title: "Finish preparing 2 sources",
        detail: "Saved but not yet available.",
        action: "index",
        priority: "high",
      }],
      attentionSources: [
        {
          id: "source-1",
          title: "Company services guide",
          issue: "not_searchable",
          detail: "Saved successfully, but not yet available to Coach or content generation.",
        },
        {
          id: "source-2",
          title: "Pricing policy",
          issue: "not_searchable",
          detail: "Saved successfully, but not yet available to Coach or content generation.",
        },
      ],
    };
    (api.get as jest.Mock).mockResolvedValue(blocked);
    const onIndex = jest.fn().mockResolvedValue({ processed: 0, remaining: 0 });

    render(
      <VaultReadinessDashboard
        clientId="11111111-1111-4111-8111-111111111111"
        canCurate
        canIndex
        version="1"
        onAdd={jest.fn()}
        onIndex={onIndex}
      />,
    );

    expect(await screen.findByText("Company services guide")).toBeInTheDocument();
    expect(screen.getByText("Pricing policy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fix now" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "No source changed. 2 still need attention",
    );
    expect(onIndex).toHaveBeenCalledTimes(1);
  });
});
