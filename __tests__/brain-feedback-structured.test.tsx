/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrainFeedback } from "@/components/brain/BrainFeedback";

const mockSendSignal = jest.fn();
jest.mock("@/hooks/useBrainSignal", () => ({
  useBrainSignal: () => ({ sendSignal: mockSendSignal, isSending: false }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));

describe("structured Brain feedback", () => {
  beforeEach(() => mockSendSignal.mockReset().mockResolvedValue({ id: "signal" }));

  it("collects a reason and supported dimensions without a browser prompt", async () => {
    const prompt = jest.spyOn(window, "prompt");
    render(
      <BrainFeedback
        clientId="11111111-1111-4111-8111-111111111111"
        surface="content_draft"
        artifactId="22222222-2222-4222-8222-222222222222"
        artifactText="Draft copy"
        context={{ channel: "linkedin", contentType: "founder_opinion" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Give negative feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Too promotional" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Optional feedback detail" }), {
      target: { value: "It sounds like generic sales copy." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save feedback" }));

    await waitFor(() => expect(mockSendSignal).toHaveBeenCalledWith(expect.objectContaining({
      rating: -1,
      dimensions: ["promotional_intensity", "voice"],
      channel: "linkedin",
      content_type: "founder_opinion",
      reason: expect.stringContaining("generic sales copy"),
    })));
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });
});
