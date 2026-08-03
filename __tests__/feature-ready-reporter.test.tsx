/** @jest-environment jsdom */

import { render, waitFor } from "@testing-library/react";
import { FeatureReadyReporter } from "@/components/layout/FeatureReadyReporter";

jest.mock("next/navigation", () => ({ usePathname: () => "/reports" }));

describe("feature readiness", () => {
  beforeEach(() => {
    sessionStorage.clear();
    (global.fetch as jest.Mock).mockReset().mockResolvedValue({ ok: true, status: 204 });
  });

  test("reports required data readiness separately from the route shell", async () => {
    render(<FeatureReadyReporter feature="monthly_reports" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      eventType: "feature_ready",
      path: "/reports",
      metadata: { feature: "monthly_reports" },
      attempt: 0,
    });
    expect(body.navigationId).toEqual(expect.any(String));
    expect(body.durationMs).toEqual(expect.any(Number));
  });
});
