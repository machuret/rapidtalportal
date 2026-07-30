/**
 * @jest-environment node
 *
 * Retry-safety tests for the API client. The key correctness property: a failed
 * write must NOT be silently retried, because the server may have already
 * committed it — a retry would duplicate the record. Reads are safe to retry.
 */

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

describe("api-client retry safety", () => {
  beforeEach(() => { (global as { fetch: unknown }).fetch = jest.fn(); });

  test("a GET is retried on a network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    await expect(api.get("/x", { retries: 2 })).rejects.toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("a POST is NOT retried on a network error (avoids duplicate writes)", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    await expect(api.post("/x", {}, { retries: 3 })).rejects.toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a POST explicitly marked idempotent IS retried", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));
    await expect(api.post("/x", {}, { retries: 2, idempotent: true })).rejects.toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("a successful GET makes a single call", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await expect(api.get("/x")).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("a 4xx response is not retried", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "bad" }) });
    await expect(api.get("/x", { retries: 3 })).rejects.toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("structured validation errors become readable text, never [object Object]", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          formErrors: [],
          fieldErrors: {
            status: ["Invalid option: expected one of draft, approved, archived"],
            expected_updated_at: ["Required"],
          },
        },
      }),
    });

    await expect(api.patch("/content/pieces", {})).rejects.toThrow(
      "status: Invalid option: expected one of draft, approved, archived; expected_updated_at: Required",
    );
  });

  test("provider error objects and opaque values have safe messages", () => {
    expect(errorMessage({ error: { message: "Provider quota exceeded" } })).toBe("Provider quota exceeded");
    expect(errorMessage(new Error("[object Object]"), "Readable fallback")).toBe("Readable fallback");
    expect(errorMessage({ unexpected: { value: 1 } }, "Readable fallback")).toBe("Readable fallback");
  });
});
