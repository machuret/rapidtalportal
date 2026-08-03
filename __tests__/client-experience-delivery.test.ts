/** @jest-environment jsdom */

import {
  configureClientExperienceActor,
  ensureClientNavigation,
  flushClientExperienceEvents,
  reportClientDestination,
  reportClientExperience,
} from "@/lib/client-experience";

describe("client experience delivery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    configureClientExperienceActor("11111111-1111-4111-8111-111111111111");
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  test("retries the same idempotent event after a failed delivery", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    reportClientExperience({ eventType: "page_slow", path: "/vault", durationMs: 9000, metadata: {} });
    await flushClientExperienceEvents();
    await flushClientExperienceEvents();

    const bodies = (global.fetch as jest.Mock).mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].events[0].eventId).toBe(bodies[1].events[0].eventId);
    expect(sessionStorage.getItem("rapidtal:experience-queue:11111111-1111-4111-8111-111111111111")).toBe("[]");
  });

  test("uses one interaction ID from destination selection through route readiness", () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    reportClientDestination({
      sourcePath: "/guide",
      targetPath: "/content/quick",
      source: "guide_goal",
    });

    const queue = JSON.parse(
      sessionStorage.getItem("rapidtal:experience-queue:11111111-1111-4111-8111-111111111111") ?? "[]",
    );
    const destination = queue.find((event: { eventType: string }) => event.eventType === "navigation_destination_opened");
    const targetNavigation = ensureClientNavigation("/content/quick");
    expect(destination.targetPath).toBe("/content/quick");
    expect(destination.interactionId).toBe(targetNavigation.id);
    expect(destination.navigationId).toBe(targetNavigation.id);
  });

  test("canonicalises record deep links before correlating route readiness", () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    reportClientDestination({
      sourcePath: "/dashboard",
      targetPath: "/crm?contact=22222222-2222-4222-8222-222222222222#details",
      source: "command_palette_search",
      resultKind: "contact",
    });
    const queue = JSON.parse(
      sessionStorage.getItem("rapidtal:experience-queue:11111111-1111-4111-8111-111111111111") ?? "[]",
    );
    const destination = queue.find((event: { eventType: string }) => event.eventType === "navigation_destination_opened");
    const targetNavigation = ensureClientNavigation("/crm");
    expect(destination.targetPath).toBe("/crm");
    expect(destination.interactionId).toBe(targetNavigation.id);
    expect(destination.metadata.result_kind).toBe("contact");
  });

  test("never assigns a previous login's persisted pending events to the next actor", async () => {
    sessionStorage.setItem("rapidtal:experience-queue:pending", JSON.stringify([{
      eventType: "page_ready",
      path: "/vault",
      eventId: "99999999-9999-4999-8999-999999999999",
      attempt: 0,
      metadata: { stage: "route_shell" },
    }]));
    jest.resetModules();
    const freshDelivery = await import("@/lib/client-experience");

    freshDelivery.configureClientExperienceActor("22222222-2222-4222-8222-222222222222");

    expect(sessionStorage.getItem("rapidtal:experience-queue:pending")).toBeNull();
    expect(sessionStorage.getItem("rapidtal:experience-queue:22222222-2222-4222-8222-222222222222")).toBe("[]");
  });
});
