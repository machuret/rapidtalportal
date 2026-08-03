/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { ClientCommandPalette } from "@/components/layout/ClientCommandPalette";
import { ClientGuide } from "@/components/guide/ClientGuide";
import { HelpFab } from "@/components/layout/HelpFab";
import { CLIENT_GUIDE } from "@/lib/client-guide";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/vault",
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock("@/components/help/LoomEmbed", () => ({ LoomEmbed: () => null }));
jest.mock("@/hooks/useClientDiscovery", () => ({
  useClientDiscovery: () => ({ results: [], partial: false, unavailableKinds: [], loading: false, error: false, expanded: false, expand: jest.fn(), retry: jest.fn() }),
}));
jest.mock("@/components/coach/ContextualCoachPanel", () => ({ ContextualCoachPanel: () => <div role="dialog" aria-label="Contextual Coach" /> }));

describe("Sprint 5 client adoption measurement", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("records destination and counts but never the client's search words", async () => {
    render(<ClientCommandPalette enabled />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Search RapidTal" });
    fireEvent.change(input, { target: { value: "upload my files" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(push).toHaveBeenCalledWith("/vault"));
    await waitFor(() => expect(sentEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "navigation_destination_opened",
        path: "/vault",
        targetPath: "/vault",
        interactionId: expect.any(String),
        metadata: expect.objectContaining({ query_token_count: 3 }),
      }),
    ])));
    expect(JSON.stringify(sentEvents())).not.toContain("upload my files");
  });

  test("records contextual help by controlled source without page content", async () => {
    render(<HelpFab clientId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByRole("button", { name: /Ask Coach about Company Knowledge/i }));
    await waitFor(() => expect(sentEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "contextual_help_opened",
        path: "/vault",
        metadata: { source: "floating_help" },
      }),
    ])));
  });

  test("records Guide result quality after search settles, without its words", async () => {
    render(<ClientGuide groups={CLIENT_GUIDE} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the Guide" }), {
      target: { value: "request work" },
    });

    await waitFor(() => {
      expect(sentEvents()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          eventType: "guide_search_used",
          path: "/guide",
          metadata: expect.objectContaining({ query_token_count: 2 }),
        }),
      ]));
      expect(JSON.stringify(sentEvents())).not.toContain("request work");
    }, { timeout: 1_500 });
  });

  test("database aggregation is service-only and preserves product/system separation", () => {
    const root = path.resolve(__dirname, "..");
    const migration = readFileSync(path.join(root, "db/migrations/20260803000700_client_experience_sprint5.sql"), "utf8");
    const healthPage = readFileSync(path.join(root, "app/(portal)/admin/health/page.tsx"), "utf8");
    expect(migration).toContain("CREATE FUNCTION health_client_adoption");
    expect(migration).toContain("CREATE FUNCTION health_client_onboarding_funnel");
    expect(migration).toContain("REVOKE ALL ON FUNCTION health_client_adoption(TIMESTAMPTZ)");
    expect(migration).toContain("Search text is never stored");
    expect(healthPage).toContain("Product adoption is intentionally separate from operational health");
    expect(healthPage).toContain("search text and client content are not");
  });
});

function sentEvents() {
  return (global.fetch as jest.Mock).mock.calls.flatMap((call) => {
    const body = JSON.parse(call[1].body);
    return Array.isArray(body.events) ? body.events : [body];
  });
}
