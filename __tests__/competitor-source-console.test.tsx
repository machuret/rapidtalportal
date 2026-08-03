/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { SourceConsole } from "@/components/content/competitors/SourceConsole";
import type { Competitor } from "@/types/competitors";

jest.mock("@/lib/api-client", () => ({
  api: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const competitor = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: "22222222-2222-4222-8222-222222222222",
  name: "Market Rival",
  description: "A relevant competitor",
  status: "active",
  refresh_cadence: "manual",
  sources: [],
  recent_items: [],
  identity_warnings: [],
  readiness: {
    positioning_ready: false,
    content_strategy_ready: false,
    captured_items: 0,
    content_characters: 0,
    article_count: 0,
    social_post_count: 0,
    positioning_readiness_score: 0,
    editorial_readiness_score: 0,
    limitations: [],
  },
} as unknown as Competitor;

describe("competitor source console", () => {
  test("keeps large competitor details collapsed until the user opens them", () => {
    render(
      <SourceConsole
        clientId={competitor.client_id}
        canManage
        competitor={competitor}
        onChanged={jest.fn().mockResolvedValue(undefined)}
        onActionError={jest.fn()}
        captureBrowser={null}
        onBrowseCaptures={jest.fn()}
        onInspectCapture={jest.fn()}
        onCloseCaptures={jest.fn()}
      />,
    );

    expect(screen.queryByText(/Mini Vault:/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Manage sources/i }));
    expect(screen.getByText(/Mini Vault:/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /Hide details/i })).toHaveAttribute("aria-expanded", "true");
  });
});
