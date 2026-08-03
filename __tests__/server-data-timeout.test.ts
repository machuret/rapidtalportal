/** @jest-environment node */

import { PortalDataTimeoutError, withPortalDataTimeout } from "@/lib/server-data-timeout";

describe("portal server-data deadline", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("returns data that completes inside the deadline", async () => {
    await expect(withPortalDataTimeout(Promise.resolve("ready"), "Test data", 100)).resolves.toBe("ready");
  });

  test("rejects a stalled page read with an identifiable operation", async () => {
    let wasAborted = false;
    const pending = withPortalDataTimeout((operationSignal) => {
      operationSignal.addEventListener("abort", () => { wasAborted = true; });
      return new Promise<never>(() => undefined);
    }, "Monthly report", 100);
    const rejection = expect(pending).rejects.toEqual(expect.objectContaining<Partial<PortalDataTimeoutError>>({
      name: "PortalDataTimeoutError",
      operation: "Monthly report",
      timeoutMs: 100,
    }));
    await jest.advanceTimersByTimeAsync(100);
    await rejection;
    expect(wasAborted).toBe(true);
  });
});
