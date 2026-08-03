/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { RecoverablePortalLoading } from "@/components/layout/RecoverablePortalLoading";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/lead-generation",
  useRouter: () => ({ refresh }),
}));

describe("recoverable client loading", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refresh.mockReset();
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => jest.useRealTimers());

  test("names the workspace and explains what is loading", () => {
    render(<RecoverablePortalLoading />);
    expect(screen.getByRole("status", { name: "Loading lead workspace" })).toBeInTheDocument();
    expect(screen.getByText("Loading campaigns, searches and lead results.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  test("turns a slow route into a recoverable state and records the retry", async () => {
    render(<RecoverablePortalLoading />);
    act(() => jest.advanceTimersByTime(3_100));

    expect(screen.getByText("This is taking longer than expected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Dashboard" })).toHaveAttribute("href", "/dashboard");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/experience/events", expect.objectContaining({ method: "POST" }));

    // A refresh can preserve the Suspense fallback. Recovery must re-arm for
    // the same pathname instead of returning to a permanent spinner.
    act(() => jest.advanceTimersByTime(3_100));
    expect(screen.getByText("This is taking longer than expected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  test("explains a prolonged delay instead of spinning forever", () => {
    render(<RecoverablePortalLoading />);
    act(() => jest.advanceTimersByTime(10_100));
    expect(screen.getByText("The service may be delayed")).toBeInTheDocument();
    expect(screen.getByText(/will not create duplicate work/i)).toBeInTheDocument();
  });
});
