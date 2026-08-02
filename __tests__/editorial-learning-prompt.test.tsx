/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api-client";
import { EditorialLearningPrompt } from "@/components/content/EditorialLearningPrompt";

jest.mock("@/lib/api-client", () => ({ api: { post: jest.fn() } }));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));

const suggestion = {
  id: "suggestion-1",
  classification: "voice_preference",
  proposed_outcome: "brain_preference",
  dimensions: ["voice"],
  summary: "Use a more direct opening",
  lesson_content: "Open with the conclusion.",
  explanation: "The introduction was shortened.",
  proposed_scope: {},
  confidence: 0.8,
  status: "proposed",
};

describe("EditorialLearningPrompt scopes", () => {
  beforeEach(() => jest.clearAllMocks());

  test("does not render duplicate controls when content type repeats the channel", async () => {
    const user = userEvent.setup();
    (api.post as jest.Mock).mockResolvedValue({});
    render(
      <EditorialLearningPrompt
        clientId="11111111-1111-4111-8111-111111111111"
        suggestion={suggestion}
        channel="linkedin"
        contentType="linkedin"
        onHandled={jest.fn()}
      />,
    );

    const channelButton = screen.getByRole("button", {
      name: "Remember this lesson for the linkedin channel",
    });
    expect(screen.queryByRole("button", {
      name: "Remember this lesson for linkedin content on any channel",
    })).not.toBeInTheDocument();

    await user.click(channelButton);
    expect(api.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      action: "remember_channel",
    }));
  });

  test("explains channel and content-type scopes when they are different", () => {
    render(
      <EditorialLearningPrompt
        clientId="11111111-1111-4111-8111-111111111111"
        suggestion={suggestion}
        channel="linkedin"
        contentType="founder_opinion"
        onHandled={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Remember this lesson for the linkedin channel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remember this lesson for founder opinion content on any channel" })).toBeInTheDocument();
  });
});
