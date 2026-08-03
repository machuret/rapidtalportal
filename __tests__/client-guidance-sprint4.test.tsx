/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientGuide } from "@/components/guide/ClientGuide";
import { ClientCommandPalette } from "@/components/layout/ClientCommandPalette";
import { HelpFab } from "@/components/layout/HelpFab";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { CLIENT_GUIDE } from "@/lib/client-guide";
import {
  CLIENT_NAVIGATION_DESTINATIONS,
  clientDestinationForPath,
  searchClientDestinations,
} from "@/lib/client-navigation";
import type { DbClient, DbUser } from "@/types/database";

let pathname = "/vault";
let searchParams: Record<string, string | null> = {};
const palettePush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => ({ get: (key: string) => searchParams[key] ?? null }),
  useRouter: () => ({ push: palettePush, refresh: jest.fn() }),
}));
jest.mock("@/hooks/useSupabase", () => ({
  useSupabase: () => ({ auth: { signOut: jest.fn().mockResolvedValue(undefined) } }),
}));
jest.mock("@/components/layout/NotificationsBell", () => ({
  NotificationsBell: () => <button aria-label="Notifications" />,
}));
jest.mock("@/components/help/LoomEmbed", () => ({ LoomEmbed: () => null }));
jest.mock("@/hooks/useClientDiscovery", () => ({
  useClientDiscovery: () => ({ results: [], partial: false, unavailableKinds: [], loading: false, error: false, expanded: false, expand: jest.fn(), retry: jest.fn() }),
}));
jest.mock("@/components/coach/ContextualCoachPanel", () => ({
  ContextualCoachPanel: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Contextual Coach"><button onClick={onClose}>Close Coach</button></div>,
}));

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "client@example.com",
  full_name: "Client Admin",
  role: "client_admin",
  client_id: "22222222-2222-4222-8222-222222222222",
} as DbUser;

const client = {
  id: user.client_id,
  name: "Example Company",
  slug: "example-company",
  created_at: "2026-08-03T00:00:00.000Z",
  created_by: null,
  archived_at: null,
} as DbClient;

describe("Sprint 4 client guidance", () => {
  beforeEach(() => {
    pathname = "/vault";
    searchParams = {};
    palettePush.mockReset();
    localStorage.clear();
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  test("searches the Guide using the outcome a client wants", async () => {
    const browser = userEvent.setup();
    render(<ClientGuide groups={CLIENT_GUIDE} />);

    expect(screen.getByRole("link", { name: /Create marketing content/i })).toHaveAttribute("href", "/content/quick");
    await browser.type(screen.getByRole("searchbox", { name: "Search the Guide" }), "request work");

    expect(screen.getByText(/guide result/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Tasks" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Voice" })).not.toBeInTheDocument();
  });

  test("opens a global client destination search from the keyboard", async () => {
    const browser = userEvent.setup();
    render(<ClientCommandPalette enabled />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const search = await screen.findByRole("combobox", { name: "Search RapidTal" });
    await browser.type(search, "google maps");

    expect(screen.getByRole("option", { name: /Find leads/i })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Content library/i })).not.toBeInTheDocument();
  });

  test.each([
    ["create a post", "Create content"],
    ["write linkedin post", "Create content"],
    ["upload pdf", "Knowledge"],
    ["manage password", "Access"],
    ["send email to contact", "CRM"],
    ["competitor article", "Competitor insights"],
    ["competittor insights", "Competitor insights"],
  ])("maps the natural-language goal %s to %s", (query, expected) => {
    expect(searchClientDestinations(query)[0]?.label).toBe(expected);
  });

  test("does not steal the link shortcut from an editor", () => {
    render(<ClientCommandPalette enabled />);
    const editor = document.createElement("textarea");
    document.body.appendChild(editor);
    editor.focus();
    fireEvent.keyDown(editor, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: /Common goals/i })).not.toBeInTheDocument();
    editor.remove();
  });

  test("supports arrow selection, Enter navigation and restores focus", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open search";
    document.body.appendChild(trigger);
    trigger.focus();
    render(<ClientCommandPalette enabled />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = await screen.findByRole("combobox", { name: "Search RapidTal" });
    fireEvent.change(search, { target: { value: "approve content" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(palettePush).toHaveBeenCalledWith("/content/style");
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  test("contextual help opens in place and falls back safely without a client", () => {
    const help = render(<HelpFab clientId={user.client_id} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Coach about Company Knowledge" }));
    expect(screen.getByRole("dialog", { name: "Contextual Coach" })).toBeVisible();
    help.unmount();

    render(<HelpFab />);
    expect(screen.getByRole("link", { name: "Open the Guide" })).toHaveAttribute("href", "/guide");
  });

  test("remembers a client's navigation group choice", async () => {
    pathname = "/dashboard";
    const first = render(<Sidebar user={user} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute("aria-expanded", "true");
    first.unmount();

    render(<Sidebar user={user} client={client} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute("aria-expanded", "true"));
  });

  test("closes the mobile drawer before opening global search", () => {
    pathname = "/dashboard";
    const onNavigate = jest.fn();
    const opened = jest.fn();
    window.addEventListener("rapidtal:open-client-navigation", opened);
    render(<Sidebar user={user} client={client} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Search and jump to a feature" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("rapidtal:open-client-navigation", opened);
  });

  test("keeps the closed mobile drawer inert and restores focus on Escape", async () => {
    render(<SidebarShell user={user} client={client} />);
    await waitFor(() => expect(document.querySelector("[inert]")).toBeTruthy());

    const opener = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(opener);
    const drawer = await screen.findByRole("dialog", { name: "Portal navigation" });
    fireEvent.keyDown(drawer, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Portal navigation" })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("synchronises Guide searches when the URL changes without remounting", async () => {
    searchParams = { q: "request work" };
    const guide = render(<ClientGuide groups={CLIENT_GUIDE} />);
    expect(screen.getByRole("searchbox", { name: "Search the Guide" })).toHaveValue("request work");

    searchParams = { q: "upload pdf" };
    guide.rerender(<ClientGuide groups={CLIENT_GUIDE} />);
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search the Guide" })).toHaveValue("upload pdf"));
    expect(screen.getByRole("button", { name: "Knowledge" })).toHaveAttribute("aria-expanded", "true");
  });

  test("indexes every destination that shares a Guide section", async () => {
    const browser = userEvent.setup();
    render(<ClientGuide groups={CLIENT_GUIDE} />);
    await browser.type(screen.getByRole("searchbox", { name: "Search the Guide" }), "archive export");
    expect(screen.getByRole("button", { name: "Create content" })).toBeVisible();
  });

  test("one canonical contract powers route help and plain-language search", () => {
    expect(clientDestinationForPath("/content/ideas")?.label).toBe("Create content");
    expect(clientDestinationForPath("/company-dna/competitors")?.label).toBe("Competitor insights");
    expect(searchClientDestinations("add documents").map((item) => item.label)).toContain("Knowledge");
    expect(new Set(CLIENT_NAVIGATION_DESTINATIONS.map((item) => item.href)).size).toBeGreaterThan(10);
    const guideTitles = new Set(CLIENT_GUIDE.flatMap((group) => group.items.map((item) => item.title)));
    for (const destination of CLIENT_NAVIGATION_DESTINATIONS) {
      if (destination.guideTitle) expect(guideTitles).toContain(destination.guideTitle);
    }
  });
});
