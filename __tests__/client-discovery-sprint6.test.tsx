/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClientCommandPalette } from "@/components/layout/ClientCommandPalette";
import { HelpFab } from "@/components/layout/HelpFab";
import { coachPageContextForPath } from "@/supabase/functions/_shared/coach-page-context";
import { loadCoachPageState } from "@/supabase/functions/_shared/coach-page-state";

const push = jest.fn();
let pathname = "/vault";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
jest.mock("@/lib/client-experience", () => ({
  reportClientDestination: jest.fn(),
  reportClientExperience: jest.fn(),
}));

const ask = jest.fn();
jest.mock("@/components/coach/useCoachChat", () => ({
  useCoachChat: jest.fn(() => ({
    question: "", setQuestion: jest.fn(), turns: [], interim: null, loading: false,
    askFailure: null, streamAbortRef: { current: null }, ask,
  })),
}));

describe("Sprint 6 global discovery and contextual Coach", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    pathname = "/vault";
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  test("opens a ranked saved record and can expand the search", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: Array.from({ length: 8 }, (_, index) => ({
          id: `record-${index}`, kind: "knowledge", title: index ? `Acme ${index}` : "Acme dossier",
          detail: "Company source", status: "ready", href: `/vault?open=record-${index}`,
        })),
        partial: false, unavailableKinds: [],
      }),
    });
    render(<ClientCommandPalette enabled />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByRole("combobox", { name: "Search RapidTal" }), { target: { value: "Acme dossier" } });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(await screen.findByRole("option", { name: /Acme dossier/i })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Search more saved records" }));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(global.fetch).toHaveBeenLastCalledWith("/api/discovery/search", expect.objectContaining({ body: expect.stringContaining('"limit":25') }));
    fireEvent.click(screen.getByRole("option", { name: /Acme dossier/i }));
    expect(push).toHaveBeenCalledWith("/vault?open=record-0");
  });

  test("does not hide record-search failure behind a feature shortcut", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    render(<ClientCommandPalette enabled />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByRole("combobox", { name: "Search RapidTal" }), { target: { value: "knowledge" } });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(await screen.findByRole("alert")).toHaveTextContent("saved records could not be searched");
    expect(screen.getByRole("option", { name: /Knowledge/i })).toBeVisible();
  });

  test("removes stale saved records as soon as the user changes the query", async () => {
    const responses = [
      { results: [{ id: "old", kind: "knowledge", title: "Old dossier", detail: "Knowledge", status: "ready", href: "/vault?open=old" }], partial: false, unavailableKinds: [] },
      { results: [{ id: "new", kind: "knowledge", title: "New dossier", detail: "Knowledge", status: "ready", href: "/vault?open=new" }], partial: false, unavailableKinds: [] },
    ];
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => responses[0] })
      .mockResolvedValueOnce({ ok: true, json: async () => responses[1] });
    render(<ClientCommandPalette enabled />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Search RapidTal" });
    fireEvent.change(input, { target: { value: "Old dossier" } });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(await screen.findByRole("option", { name: /Old dossier/i })).toBeVisible();

    fireEvent.change(input, { target: { value: "New dossier" } });
    expect(screen.queryByRole("option", { name: /Old dossier/i })).not.toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(await screen.findByRole("option", { name: /New dossier/i })).toBeVisible();
  });

  test("ranks an exact saved record above a generic feature destination", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ id: "knowledge-record", kind: "knowledge", title: "Knowledge", detail: "Exact saved record", status: "ready", href: "/vault?open=knowledge-record" }],
        partial: false,
        unavailableKinds: [],
      }),
    });
    render(<ClientCommandPalette enabled />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByRole("combobox", { name: "Search RapidTal" }), { target: { value: "Knowledge" } });
    await act(async () => { jest.advanceTimersByTime(300); });
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Exact saved record");
  });

  test("opens contextual Coach in place with a controlled page key and restores focus", async () => {
    const { useCoachChat } = jest.requireMock("@/components/coach/useCoachChat") as { useCoachChat: jest.Mock };
    render(<HelpFab clientId="22222222-2222-4222-8222-222222222222" coachRole="va" />);
    const trigger = screen.getByRole("button", { name: "Ask Coach about Company Knowledge" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /Coach for Company Knowledge/i })).toBeVisible();
    expect(useCoachChat).toHaveBeenCalledWith(expect.objectContaining({ pageContext: "knowledge", coachRole: "va", persistConversation: false }));
    fireEvent.click(screen.getByRole("button", { name: "Close contextual Coach" }));
    await act(async () => { jest.runOnlyPendingTimers(); });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("covers specialist client workspaces with the correct context", () => {
    expect(coachPageContextForPath("/content/competitors")?.key).toBe("competitors");
    expect(coachPageContextForPath("/daily-log")?.key).toBe("daily_log");
    expect(coachPageContextForPath("/company-report")?.key).toBe("company_report");
    expect(coachPageContextForPath("/brain/learning")?.key).toBe("brain");
    expect(coachPageContextForPath("/tools/social/linkedin")?.key).toBe("tools");
  });

  test("Coach reports a failed workspace read as unavailable instead of zero", async () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "limit"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "database unavailable" } }).then(resolve);
    const admin = { from: jest.fn(() => builder) };
    await expect(loadCoachPageState({ admin, clientId: "client-one", contextKey: "knowledge" }))
      .resolves.toEqual(["Company knowledge sources: status is temporarily unavailable."]);
  });
});
