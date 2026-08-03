/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import CoachLoading from "@/app/(portal)/ask/loading";

jest.mock("next/navigation", () => ({
  usePathname: () => "/ask",
  useRouter: () => ({ refresh: jest.fn() }),
}));

test("Coach shows a useful route-level loading state", () => {
  render(<CoachLoading />);

  expect(screen.getByRole("status", { name: "Loading RapidTal Coach" })).toBeInTheDocument();
  expect(screen.getByText("Loading your RapidTal Coach…")).toBeInTheDocument();
  expect(screen.getByText("Loading your private Coach workspace and company context.")).toBeInTheDocument();
});
