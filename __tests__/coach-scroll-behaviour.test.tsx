/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { AskVaultClient } from "@/components/coach/AskVaultClient";

let mockChat: {
  turns: unknown[];
  interim: unknown;
  [key: string]: unknown;
};

jest.mock("@/components/coach/useCoachChat", () => ({
  useCoachChat: () => mockChat,
}));
jest.mock("@/components/coach/ChatTurn", () => ({ ChatTurn: () => <div data-testid="chat-turn" /> }));
jest.mock("@/components/vault/CoachProgressPanel", () => ({ CoachProgressPanel: () => null }));
jest.mock("@/components/vault/CoachMemoryPanel", () => ({ CoachMemoryPanel: () => null }));
jest.mock("@/components/intelligence/AskBrainFlow", () => ({ AskBrainFlow: () => <div>Brain flow</div> }));

const scrollSpy = jest.fn();

function makeTurn(question: string) {
  return {
    question,
    answer: `A: ${question}`,
    sources: [],
    brainContextSnapshotId: null,
    libraryAvailability: "not_requested",
    warnings: [],
    suggestions: [],
    queriedKinds: [],
    coachMode: "private",
    actionDraft: null,
    actionStatus: "none",
    persistenceStatus: "persisted",
  };
}

function makeInterim(question: string, answer: string) {
  return {
    question,
    answer,
    sources: [],
    queriedKinds: [],
    libraryAvailability: "not_requested",
    warnings: [],
    suggestions: [],
    coachMode: "private",
  };
}

function renderChat() {
  return render(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
}

/** jsdom reports every element rect as all-zeros (i.e. "at the bottom"); this
 *  makes the end marker sit 5000px below the fold — a user who scrolled up. */
function scrollUpBeyondThreshold() {
  const rect = { bottom: 5000, top: 5000, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  const spy = jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
  fireEvent.scroll(window);
  spy.mockRestore();
}

describe("Coach auto-scroll behaviour", () => {
  beforeEach(() => {
    scrollSpy.mockClear();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    mockChat = {
      question: "",
      setQuestion: jest.fn(),
      coachMode: "private",
      setCoachMode: jest.fn(),
      turns: [],
      historyLoading: false,
      hasMoreHistory: false,
      loadingOlder: false,
      loadOlderTurns: jest.fn(),
      loading: false,
      interim: null,
      askFailure: null,
      streamAbortRef: { current: null },
      ask: jest.fn(),
      goDeeper: jest.fn(),
      newConversation: jest.fn(),
      retryTurnPersistence: jest.fn(),
    };
  });

  it("scrolls to the bottom on mount", () => {
    renderChat();
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("keeps the first-question flow simple and offers a continuation after an answer", () => {
    mockChat.turns = [makeTurn("What should we prioritise?")];
    render(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} onboardingMode />);

    expect(screen.getByText("Step 4 of 6")).toBeInTheDocument();
    expect(screen.queryByText("Brain flow")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track Goal" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask your first question…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue/i })).toHaveAttribute("href", "/dashboard");
  });

  it("never completes onboarding while the first answer is unsaved", () => {
    const turn = { ...makeTurn("What should we prioritise?"), persistenceStatus: "failed" };
    mockChat.turns = [turn];
    render(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} onboardingMode />);

    expect(screen.queryByRole("link", { name: /continue/i })).not.toBeInTheDocument();
    expect(screen.getByText("Your answer is ready, but progress was not saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry save/i }));
    expect(mockChat.retryTurnPersistence).toHaveBeenCalledWith(turn);
  });

  it("follows streamed tokens only while the user stays near the bottom", () => {
    const { rerender } = renderChat();
    scrollSpy.mockClear();

    // New interim bubble (user just asked) — always scrolls, smoothly.
    mockChat.interim = makeInterim("q1", "");
    rerender(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
    scrollSpy.mockClear();

    // Token updates while pinned — follows instantly.
    mockChat.interim = makeInterim("q1", "First tokens");
    rerender(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto" });
    scrollSpy.mockClear();

    // User scrolls up mid-stream — the next tokens must NOT yank them down.
    scrollUpBeyondThreshold();
    mockChat.interim = makeInterim("q1", "First tokens, more tokens");
    rerender(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("always scrolls for an appended turn, never for a prepended older page", () => {
    const { rerender } = renderChat();
    scrollSpy.mockClear();

    // The user is scrolled up reading history.
    scrollUpBeyondThreshold();

    // A new completed turn lands at the end — jumps to it even when unpinned.
    const latest = makeTurn("newest");
    mockChat.turns = [latest];
    mockChat.interim = null;
    rerender(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockClear();

    // "Load older messages" prepends — the reading position is left alone.
    scrollUpBeyondThreshold();
    mockChat.turns = [makeTurn("older"), latest];
    rerender(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
    expect(scrollSpy).not.toHaveBeenCalled();

    // Scrolling back to the bottom re-pins the follow behaviour.
    fireEvent.scroll(window);
    mockChat.turns = [...mockChat.turns];
    rerender(<AskVaultClient clientId="client-1" companyName="Acme" canCurate={false} />);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto" });
  });
});
