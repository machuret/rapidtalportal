/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { CompetitorsTab } from "@/components/content/competitors/CompetitorsTab";
import { api } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/content/competitors/SourceConsole", () => ({
  SourceConsole: ({ competitor }: { competitor: { name: string } }) => (
    <div data-testid="source-console">Sources for {competitor.name}</div>
  ),
}));
jest.mock("@/components/content/competitors/intelligence/CompetitorIntelligencePanel", () => ({
  CompetitorIntelligencePanel: () => <div data-testid="intelligence-panel">Market analysis</div>,
}));

describe("unified competitor workspace", () => {
  beforeEach(() => jest.clearAllMocks());

  test("guides clients from source collection to analysis on one route", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      competitors: [{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Market Rival",
        status: "active",
        sources: [],
        readiness: {
          content_strategy_ready: false,
          positioning_ready: false,
        },
      }],
    });

    render(
      <CompetitorsTab
        clientId="22222222-2222-4222-8222-222222222222"
        canManage
      />,
    );

    await waitFor(() => expect(screen.getByTestId("source-console")).toBeVisible());
    expect(screen.getByRole("list", { name: "Competitor workflow" })).toHaveTextContent("Collect sources");
    expect(screen.getByRole("list", { name: "Competitor workflow" })).toHaveTextContent("Analyse the market");
    expect(screen.getByRole("list", { name: "Competitor workflow" })).toHaveTextContent("Build content");
    expect(screen.getByRole("heading", { name: "Collect useful market sources" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Analyse the market and choose an opportunity" })).toBeVisible();

    const source = screen.getByTestId("source-console");
    const intelligence = screen.getByTestId("intelligence-panel");
    expect(source.compareDocumentPosition(intelligence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("gives a VA a useful read-only empty state", async () => {
    (api.get as jest.Mock).mockResolvedValue({ competitors: [] });
    render(
      <CompetitorsTab
        clientId="22222222-2222-4222-8222-222222222222"
        canManage={false}
      />,
    );

    expect(await screen.findByText(/ask your client admin to add competitor websites/i)).toBeVisible();
    expect(screen.queryByTestId("competitor-add-button")).not.toBeInTheDocument();
  });

  test("does not disguise a load failure as an empty competitor account", async () => {
    (api.get as jest.Mock).mockRejectedValue(new Error("Connection unavailable"));
    render(
      <CompetitorsTab
        clientId="22222222-2222-4222-8222-222222222222"
        canManage
      />,
    );

    expect(await screen.findByText("Competitor workspace could not be loaded")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("No competitors added yet")).not.toBeInTheDocument();
  });
});
