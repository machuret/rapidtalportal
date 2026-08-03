/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ContentSectionNav } from "@/components/content/ContentSectionNav";
import type { DbClient, DbUser } from "@/types/database";
import { CLIENT_GUIDE } from "@/lib/client-guide";

let pathname = "/dashboard";
let hasSetupQuery = false;

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => ({ has: (key: string) => key === "setup" && hasSetupQuery }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/hooks/useSupabase", () => ({
  useSupabase: () => ({ auth: { signOut: jest.fn().mockResolvedValue(undefined) } }),
}));

jest.mock("@/components/layout/NotificationsBell", () => ({
  NotificationsBell: () => <button aria-label="Notifications" />,
}));

const clientAdmin = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "client@example.com",
  full_name: "Client Admin",
  role: "client_admin",
  client_id: "22222222-2222-4222-8222-222222222222",
} as DbUser;

const client = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Example Company",
  slug: "example-company",
  created_at: "2026-08-03T00:00:00.000Z",
  created_by: null,
  archived_at: null,
} as DbClient;

describe("client information architecture", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    hasSetupQuery = false;
  });

  test("presents a compact goal-based navigation instead of implementation areas", () => {
    render(<Sidebar user={clientAdmin} client={client} />);

    expect(screen.getByRole("link", { name: "Home" })).toBeVisible();
    for (const group of ["Work", "Create", "Grow", "Company", "Settings"]) {
      expect(screen.getByRole("button", { name: group })).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.getByRole("link", { name: "Coach" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Access" })).toBeVisible();
    expect(screen.queryByText("Company Brain")).not.toBeInTheDocument();
    expect(screen.queryByText("Company DNA")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("link", { name: "Create content" })).toHaveAttribute("href", "/content/quick");
    expect(screen.getByRole("link", { name: "In progress" })).toHaveAttribute("href", "/content/projects");
    expect(screen.getByRole("link", { name: "Content library" })).toHaveAttribute("href", "/content/library");
    expect(screen.queryByText("Competitor Ideas")).not.toBeInTheDocument();
  });

  test("automatically opens the goal group that owns the current route", () => {
    pathname = "/content/projects";
    render(<Sidebar user={clientAdmin} client={client} />);

    expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "In progress" })).toHaveAttribute("aria-current", "page");
  });

  test("treats idea discovery as part of creating rather than a separate product", () => {
    pathname = "/content/ideas";
    render(<Sidebar user={clientAdmin} client={client} />);

    expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Create content" })).toHaveAttribute("aria-current", "page");
  });

  test("keeps the three editorial destinations consistent inside Content", () => {
    pathname = "/content/ideas";
    render(<ContentSectionNav />);

    expect(screen.getByRole("link", { name: "Create content" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "In progress" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Content library" })).toBeVisible();
    expect(screen.queryByText("Voice")).not.toBeInTheDocument();
  });

  test("does not distract focused onboarding with the full content navigation", () => {
    pathname = "/content/quick";
    hasSetupQuery = true;
    const { container } = render(<ContentSectionNav />);
    expect(container).toBeEmptyDOMElement();
  });

  test("uses the same destination names in the guide and client navigation", () => {
    const guideTitles = new Set(CLIENT_GUIDE.flatMap((group) => group.items.map((item) => item.title)));
    for (const label of ["Home", "Team", "Create content", "Knowledge", "Voice", "Coach", "Find leads", "Competitor insights", "My profile"]) {
      expect(guideTitles).toContain(label);
    }
  });
});
