import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LeadGenerationWorkspace } from "@/components/prospecting/LeadGenerationWorkspace";
import { api } from "@/lib/api-client";
import type { ProspectingCampaign, ProspectingLead } from "@/types/prospecting";
import { toast } from "sonner";

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const campaign: ProspectingCampaign = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: "22222222-2222-4222-8222-222222222222",
  name: "Sydney brokers",
  source: "google_maps",
  queries: ["mortgage brokers"],
  locations: ["Sydney"],
  country_code: "au",
  language_code: "en",
  max_results: 20,
  ideal_profile: {
    requiredKeywords: ["commercial lending"],
    preferredKeywords: ["property"],
    excludedKeywords: ["recruitment"],
    minRating: 4,
    minReviewCount: 25,
    mustHaveWebsite: true,
  },
  status: "completed",
  last_job_id: null,
  created_by: null,
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
  archived_at: null,
};

const lead: ProspectingLead = {
  id: "33333333-3333-4333-8333-333333333333",
  campaign_id: campaign.id,
  job_id: "44444444-4444-4444-8444-444444444444",
  client_id: campaign.client_id,
  status: "new",
  crm_contact_id: null,
  discovered_at: "2026-08-03T00:00:00.000Z",
  last_seen_at: "2026-08-03T00:00:00.000Z",
  fit_score: 82,
  fit_band: "strong",
  fit_breakdown: {
    dimensions: { relevance: { score: 32, maximum: 35 } },
    criteria: {
      requiredMatched: ["commercial lending"],
      preferredMatched: ["property"],
      excludedMatched: [],
      minimumRating: 4,
      ratingObserved: 4.7,
      minimumRatingMet: true,
      minimumReviews: 25,
      reviewsObserved: 80,
      minimumReviewsMet: true,
    },
    explanation: "Strong match.",
  },
  score_version: "prospecting-fit-v2",
  scored_at: "2026-08-03T00:00:00.000Z",
  latest_enrichment_id: "55555555-5555-4555-8555-555555555555",
  latest_enrichment: {
    id: "55555555-5555-4555-8555-555555555555",
    website_url: "https://example.com",
    canonical_domain: "example.com",
    page_count: 2,
    page_urls: ["https://example.com", "https://example.com/contact"],
    title: "Example Finance",
    description: "Commercial finance for Australian businesses.",
    emails: ["hello@example.org", "careers@example.org"],
    phones: ["02 1234 5678"],
    social_links: { linkedin: "https://linkedin.com/company/example" },
    captured_at: "2026-08-03T00:00:00.000Z",
  },
  active_enrichment_job: null,
  prospect: {
    id: "66666666-6666-4666-8666-666666666666",
    kind: "company",
    company_name: "Example Finance",
    person_name: null,
    job_title: null,
    website_url: "https://example.com",
    linkedin_url: null,
    source_url: "https://maps.example/example",
    email: null,
    phone: null,
    address: "Sydney NSW",
    locality: "Sydney",
    region: "NSW",
    country_code: "au",
    industry: "Finance",
    rating: 4.7,
    review_count: 80,
    description: null,
    source: "google_maps",
    last_seen_at: "2026-08-03T00:00:00.000Z",
  },
  campaign: { id: campaign.id, name: campaign.name, source: campaign.source },
};

describe("Lead Generation Phase 2 review workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/api/prospecting/campaigns")) {
        return Promise.resolve({
          campaigns: [campaign], total: 1, offset: 0, limit: 50, active_jobs: [],
          usage: { runs_started: 0, results_reserved: 0, results_returned: 1, reported_cost_usd: 0, enrichments_started: 1, enrichment_pages: 2 },
        });
      }
      return Promise.resolve({ leads: [lead], total: 1, offset: 0, limit: 30 });
    });
    (api.post as jest.Mock).mockResolvedValue({ contactId: "contact-one" });
  });

  test("prioritises fit and requires an explicit scraped-contact selection", async () => {
    render(<LeadGenerationWorkspace clientId={campaign.client_id} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Lead Inbox" }));

    expect(await screen.findByText("Example Finance")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter fit")).toHaveValue("all");
    expect(screen.getByLabelText("Sort leads")).toHaveValue("fit");
    fireEvent.click(screen.getByText(/Review enrichment/));

    expect(screen.getByLabelText("Email to add to CRM")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Email to add to CRM"), { target: { value: "hello@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/prospecting/promote",
      expect.objectContaining({
        leadId: lead.id,
        selectedEmail: "hello@example.org",
        selectedPhone: null,
      }),
    ));
  });

  test("shows and saves the campaign matching rules", async () => {
    (api.patch as jest.Mock).mockResolvedValue({ campaign: { ...campaign, updated_at: "2026-08-03T01:00:00.000Z" } });
    render(<LeadGenerationWorkspace clientId={campaign.client_id} />);
    fireEvent.click(screen.getByRole("tab", { name: "Campaigns" }));

    fireEvent.click(await screen.findByText(/Matching rules:/));
    expect(screen.getByLabelText("Required matching terms")).toHaveValue("commercial lending");
    fireEvent.change(screen.getByLabelText("Preferred matching terms"), { target: { value: "property, private credit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save matching rules" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      "/api/prospecting/campaigns",
      expect.objectContaining({
        id: campaign.id,
        idealProfile: expect.objectContaining({ preferredKeywords: ["property", "private credit"] }),
      }),
    ));
  });

  test("shows a recoverable error when the latest enrichment attempt failed", async () => {
    const failedLead = {
      ...lead,
      latest_enrichment_id: null,
      latest_enrichment: null,
      latest_enrichment_job: {
        id: "77777777-7777-4777-8777-777777777777",
        status: "error",
        error_message: "The website did not return readable company pages.",
      } as ProspectingLead["latest_enrichment_job"],
    };
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/api/prospecting/campaigns")) {
        return Promise.resolve({
          campaigns: [campaign], total: 1, offset: 0, limit: 50, active_jobs: [], collaborators: [],
          usage: { runs_started: 0, results_reserved: 0, results_returned: 1, reported_cost_usd: 0, enrichments_started: 1, enrichment_pages: 0 },
        });
      }
      return Promise.resolve({ leads: [failedLead], total: 1, offset: 0, limit: 30 });
    });

    render(<LeadGenerationWorkspace clientId={campaign.client_id} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Lead Inbox" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Company enrichment did not finish");
    expect(screen.getByRole("alert")).toHaveTextContent("readable company pages");
    expect(screen.getByRole("button", { name: "Enrich company" })).toBeEnabled();
  });

  test("redirects an identical previous search to the existing campaign without calling the paid APIs", async () => {
    render(<LeadGenerationWorkspace clientId={campaign.client_id} />);
    fireEvent.click(screen.getByRole("tab", { name: "Campaigns" }));
    await screen.findByText("Sydney brokers");
    fireEvent.click(screen.getByRole("tab", { name: "Find Leads" }));
    fireEvent.change(screen.getByLabelText("Business type or service"), { target: { value: "  MORTGAGE   brokers " } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: " sydney " } });
    fireEvent.click(screen.getByRole("button", { name: "Find leads" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("already contains this search")));
    expect(screen.getByRole("tab", { name: "Campaigns" })).toHaveAttribute("aria-selected", "true");
    expect(api.post).not.toHaveBeenCalled();
  });
});
