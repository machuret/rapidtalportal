import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VaultClient } from "@/components/vault/VaultClient";
import { api } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQuery: () => ({
    data: { milestones: [], readyDocumentCount: 0 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock("@/hooks/useVaultList", () => ({
  useVaultList: () => ({
    items: [],
    counts: { total: 0, ready: 0, processing: 0, error: 0 },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    error: null,
    isError: false,
    deleteItems: jest.fn(),
    isDeleting: false,
    reprocessItem: jest.fn(),
  }),
  vaultListKeys: { all: (clientId: string) => ["vault", clientId] },
}));
jest.mock("@/components/vault/VaultReadinessDashboard", () => ({ VaultReadinessDashboard: () => null }));
jest.mock("@/components/vault/CrawlJobPanel", () => ({ CrawlJobPanel: () => null }));
jest.mock("@/components/vault/AddVaultItem", () => ({ AddVaultItem: () => null }));
jest.mock("@/components/vault/VaultRecap", () => ({ VaultRecap: () => null }));
jest.mock("@/components/vault/VaultExpanded", () => ({ VaultExpanded: () => null }));
jest.mock("@/components/content/competitors/CompetitorsTab", () => ({ CompetitorsTab: () => null }));

describe("empty Vault onboarding", () => {
  beforeEach(() => jest.clearAllMocks());

  test("starts the Company DNA website crawl with one click", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      job: { id: "job-1", status: "crawling", url: "https://example.com/" },
    });
    render(
      <VaultClient
        clientId="11111111-1111-4111-8111-111111111111"
        userId="22222222-2222-4222-8222-222222222222"
        role="client_admin"
        canWrite
        companyWebsite="https://www.example.com/"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Crawl example.com" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/vault/crawl-site",
      {
        url: "https://www.example.com/",
        clientId: "11111111-1111-4111-8111-111111111111",
      },
      { showErrorToast: false },
    ));
  });

  test("falls back to simple guidance when Company DNA has no usable website", () => {
    render(
      <VaultClient
        clientId="11111111-1111-4111-8111-111111111111"
        userId="22222222-2222-4222-8222-222222222222"
        role="client_admin"
        canWrite
      />,
    );
    expect(screen.getByText(/enter the company website above/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Crawl / })).not.toBeInTheDocument();
  });

  test("offers a focused three-document starter flow without Vault diagnostics", () => {
    render(
      <VaultClient
        clientId="11111111-1111-4111-8111-111111111111"
        userId="22222222-2222-4222-8222-222222222222"
        role="client_admin"
        canWrite
        focusMode="documents"
      />,
    );

    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
    expect(screen.getByText("Add three useful documents")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 searchable")).toBeInTheDocument();
    expect(screen.queryByText("Knowledge report")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your journey" })).toHaveAttribute("href", "/dashboard");
  });
});
