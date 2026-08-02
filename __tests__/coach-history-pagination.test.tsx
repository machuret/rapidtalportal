/** @jest-environment jsdom */

jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { act, renderHook, waitFor } from "@testing-library/react";
import { api } from "@/lib/api-client";
import { useCoachChat } from "@/components/coach/useCoachChat";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const mockGet = api.get as jest.Mock;

function turnRow(question: string, createdAt: string) {
  return {
    question,
    answer: `A: ${question}`,
    coach_mode: "private",
    brain_context_snapshot_id: "33333333-3333-4333-8333-333333333333",
    sources: [],
    suggestions: [],
    library_availability: "not_requested",
    warnings: [],
    action_draft: null,
    action_status: "none",
    created_at: createdAt,
  };
}

describe("useCoachChat history pagination", () => {
  beforeEach(() => jest.resetAllMocks());

  it("prepends the older page and advances the cursor", async () => {
    mockGet.mockResolvedValueOnce({
      thread: { id: "thread-1" },
      turns: [
        turnRow("third", "2026-08-01T00:00:03Z"),
        turnRow("fourth", "2026-08-01T00:00:04Z"),
      ],
      hasMore: true,
    });

    const { result } = renderHook(() => useCoachChat({ clientId: CLIENT_ID }));
    await waitFor(() => expect(result.current.historyLoading).toBe(false));
    expect(result.current.turns.map((t) => t.question)).toEqual(["third", "fourth"]);
    expect(result.current.hasMoreHistory).toBe(true);

    mockGet.mockResolvedValueOnce({
      thread: { id: "thread-1" },
      turns: [
        turnRow("first", "2026-08-01T00:00:01Z"),
        turnRow("second", "2026-08-01T00:00:02Z"),
      ],
      hasMore: false,
    });

    await act(async () => { await result.current.loadOlderTurns(); });

    expect(mockGet).toHaveBeenLastCalledWith(
      `/api/coach/threads?clientId=${CLIENT_ID}&before=${encodeURIComponent("2026-08-01T00:00:03Z")}`,
      expect.objectContaining({ showErrorToast: false }),
    );
    // Older page lands BEFORE the existing turns; turn shapes stay identical.
    expect(result.current.turns.map((t) => t.question)).toEqual(["first", "second", "third", "fourth"]);
    expect(result.current.turns[0]).toEqual(expect.objectContaining({
      answer: "A: first",
      coachMode: "private",
      actionStatus: "none",
    }));
    expect(result.current.hasMoreHistory).toBe(false);

    // No cursor left — further clicks are inert.
    await act(async () => { await result.current.loadOlderTurns(); });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
