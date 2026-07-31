/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { BrainGrowthMap } from "@/components/brain/BrainGrowthMap";
import type { BrainReadiness } from "@/lib/brain/readiness";

const readiness: BrainReadiness = {
  label: "Brain Readiness",
  overallStatus: "developing",
  measuredAt: "2026-07-31T00:00:00.000Z",
  contextual: {
    channel: null,
    channelReadiness: "developing",
    voiceConfidence: "medium",
    vaultCoverage: "partial",
    relevantLessons: 4,
    marketUpdatedAt: null,
  },
  dimensions: [
    { key: "knowledge", label: "Knowledge readiness", score: 84, status: "strong", summary: "", evidence: [], actions: [] },
    { key: "voice", label: "Voice readiness", score: 67, status: "developing", summary: "", evidence: [], actions: [] },
    { key: "personalisation", label: "Personalisation maturity", score: 41, status: "limited", summary: "", evidence: [], actions: [] },
    { key: "reliability", label: "Reliability", score: 73, status: "developing", summary: "", evidence: [], actions: [] },
    { key: "market", label: "Market intelligence", score: 18, status: "not_ready", summary: "", evidence: [], actions: [] },
  ],
};

describe("BrainGrowthMap", () => {
  it("shows the real readiness dimensions as a visible Brain growth map", () => {
    render(<BrainGrowthMap clientName="Example Co" readiness={readiness} />);

    expect(screen.getByRole("region", { name: "Live Brain growth map for Example Co" })).toBeInTheDocument();
    expect(screen.getByText("Watch the business Brain grow")).toBeInTheDocument();
    expect(screen.getByText("Developing")).toBeInTheDocument();
    expect(screen.getByText("Knowledge readiness")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getAllByText(/readiness|maturity|intelligence|Reliability/i).length).toBeGreaterThanOrEqual(5);
  });

  it("explains that the visual is not a hidden intelligence score", () => {
    render(<BrainGrowthMap clientName="Example Co" readiness={readiness} />);

    expect(screen.getByText(/not a hidden intelligence score/i)).toBeInTheDocument();
    expect(screen.queryByText(/Genius/i)).not.toBeInTheDocument();
  });
});
