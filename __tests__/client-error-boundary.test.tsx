/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import PortalError from "@/app/(portal)/error";

jest.mock("@/lib/report-client-error", () => ({ reportClientError: jest.fn() }));
jest.mock("@/lib/client-experience", () => ({
  reportClientExperience: jest.fn(),
  retryClientNavigation: jest.fn(),
}));

describe("client portal error recovery", () => {
  test("does not expose internal provider messages and offers two recovery paths", () => {
    const reset = jest.fn();
    const error = Object.assign(new Error("OPENROUTER_INTERNAL_PROVIDER_DETAIL"), { digest: "reference-123" });
    const originalError = console.error;
    console.error = jest.fn();
    render(<PortalError error={error} reset={reset} />);
    console.error = originalError;

    expect(screen.getByRole("heading", { name: "We couldn't load this page" })).toBeInTheDocument();
    expect(screen.queryByText("OPENROUTER_INTERNAL_PROVIDER_DETAIL")).not.toBeInTheDocument();
    expect(screen.getByText("Reference: reference-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Dashboard" })).toHaveAttribute("href", "/dashboard");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
