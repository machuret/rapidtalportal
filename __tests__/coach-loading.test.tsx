/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import CoachLoading from "@/app/(portal)/ask/loading";

test("Coach shows a useful route-level loading state", () => {
  render(<CoachLoading />);

  expect(screen.getByRole("status", { name: "Loading RapidTal Coach" })).toBeInTheDocument();
  expect(screen.getByText("Preparing your private Coach workspace…")).toBeInTheDocument();
});
