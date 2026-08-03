/** @jest-environment jsdom */

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

import { ApiError, apiClient } from "@/lib/api-client";

describe("client API deadlines", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("turns a stalled request into one recoverable timeout without retrying", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation((_input, init) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      })
    ));

    const request = apiClient("/slow", { timeoutMs: 100, retries: 3, showErrorToast: false });
    const rejection = expect(request).rejects.toMatchObject<Partial<ApiError>>({
      code: "REQUEST_TIMEOUT",
      statusCode: 408,
    });
    await jest.advanceTimersByTimeAsync(100);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
