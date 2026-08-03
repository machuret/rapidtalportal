/** @jest-environment jsdom */

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

import {
  API_REQUEST_TIMEOUTS,
  ApiError,
  apiClient,
  apiRequestClassFor,
} from "@/lib/api-client";

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

  test("gives provider-backed AI routes their real execution budget", () => {
    expect(apiRequestClassFor("/api/content/topics/generate", "POST")).toBe("extended_ai");
    expect(apiRequestClassFor("/api/content/competitors/intelligence", "POST")).toBe("extended_ai");
    expect(apiRequestClassFor("/api/content/competitors/intelligence", "GET")).toBe("read");
    expect(apiRequestClassFor("/api/content/quick-draft", "POST")).toBe("extended_ai");
    expect(apiRequestClassFor("/api/tools/newsletter", "POST")).toBe("ai");
    expect(API_REQUEST_TIMEOUTS.extended_ai).toBeGreaterThan(180_000);
    expect(API_REQUEST_TIMEOUTS.ai).toBeGreaterThan(60_000);
  });

  test("keeps ordinary reads and writes on short bounded budgets", () => {
    expect(apiRequestClassFor("/api/crm/contacts", "GET")).toBe("read");
    expect(apiRequestClassFor("/api/crm/contacts", "PATCH")).toBe("mutation");
    expect(API_REQUEST_TIMEOUTS.read).toBe(20_000);
    expect(API_REQUEST_TIMEOUTS.mutation).toBe(30_000);
  });

  test("does not abort a valid AI response after the old 20-second deadline", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        ok: true,
        status: 200,
        json: async () => ({ ideas: ["ready"] }),
      } as Response), 25_000);
    }));
    const request = apiClient<{ ideas: string[] }>("/content/topics/generate", {
      method: "POST",
      body: "{}",
      retries: 1,
      showErrorToast: false,
    });
    await jest.advanceTimersByTimeAsync(25_000);
    await expect(request).resolves.toEqual({ ideas: ["ready"] });
  });
});
