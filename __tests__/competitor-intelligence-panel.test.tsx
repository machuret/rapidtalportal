/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { api } from "@/lib/api-client";
import { CompetitorIntelligencePanel } from "@/components/content/competitors/intelligence/CompetitorIntelligencePanel";
import type { Competitor } from "@/types/competitors";

jest.mock("@/lib/api-client", () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const competitor: Competitor = {
  id: "22222222-2222-4222-8222-222222222222",
  client_id: "11111111-1111-4111-8111-111111111111",
  name: "Inglis",
  description: null,
  website_url: "https://example.com",
  status: "active",
  refresh_cadence: "weekly",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  sources: [],
  recent_items: [],
  identity_warnings: [],
  readiness: {
    source_count: 1,
    collectable_source_count: 1,
    captured_items: 8,
    article_count: 0,
    social_post_count: 0,
    distinct_platforms: 1,
    content_characters: 6000,
    latest_capture: "2026-07-30T00:00:00.000Z",
    readiness_score: 80,
    ready: true,
    positioning_readiness_score: 80,
    editorial_readiness_score: 10,
    positioning_ready: true,
    content_strategy_ready: false,
    limitations: ["No social posts are captured."],
  },
};

test("positioning-only competitors are sent to collection instead of broad analysis", async () => {
  (api.get as jest.Mock).mockResolvedValue({ run: null, active_job: null, last_job: null });
  render(
    <CompetitorIntelligencePanel
      clientId="11111111-1111-4111-8111-111111111111"
      canManage
      competitors={[competitor]}
    />,
  );

  expect(await screen.findByText("Collect content before broad analysis")).toBeInTheDocument();
  expect(screen.getByText("0 social posts · 0 articles")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analyse competitors" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Add or collect sources" })).toHaveAttribute(
    "href",
    `/company-dna/competitors#competitor-${competitor.id}`,
  );
});
