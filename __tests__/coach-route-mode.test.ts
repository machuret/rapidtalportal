/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { POST as routeMode } from "@/app/api/coach/route-mode/route";
import { modeToIntent, routedModeAllowed, ROUTE_MODE_CONFIDENCE } from "@/lib/coach/route-mode";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function call(body: unknown) {
  return routeMode(new NextRequest("https://portal.test/api/coach/route-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

function mockLlm(payload: unknown, ok = true) {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  });
}

describe("modeToIntent / routedModeAllowed", () => {
  it("maps modes to policy intents", () => {
    expect(modeToIntent("create_task")).toEqual({ type: "create_task" });
    expect(modeToIntent("message_client")).toEqual({ type: "send_message", audience: "client" });
    expect(modeToIntent("private")).toBeNull();
  });

  it("enforces the role matrix on routed modes", () => {
    expect(routedModeAllowed("create_task", "client_admin")).toBe(true);
    expect(routedModeAllowed("create_task", "va")).toBe(false);
    expect(routedModeAllowed("submit_review", "va")).toBe(true);
    expect(routedModeAllowed("submit_review", "client_admin")).toBe(false);
    expect(routedModeAllowed("create_goal", "super_admin")).toBe(false);
    expect(routedModeAllowed("private", "va")).toBe(true);
  });
});

describe("POST /api/coach/route-mode", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" },
      impersonating: false,
    });
  });
  afterEach(() => { delete process.env.OPENROUTER_API_KEY; });

  const validBody = { clientId: CLIENT_ID, question: "Assign the brief to Sarah by Friday", coachRole: "client" };

  it("rejects invalid bodies", async () => {
    expect((await call({})).status).toBe(422);
    expect((await call({ ...validBody, question: "hi" })).status).toBe(422);
    expect((await call({ ...validBody, coachRole: "super" })).status).toBe(422);
  });

  it("returns a routed action mode when the classifier is confident", async () => {
    mockLlm({ mode: "create_task", confidence: 0.9 });
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "create_task", confidence: 0.9, routed: true });
  });

  it("falls back to private below the confidence threshold", async () => {
    mockLlm({ mode: "create_task", confidence: ROUTE_MODE_CONFIDENCE - 0.1 });
    const res = await call(validBody);
    expect(await res.json()).toEqual({ mode: "private", confidence: 0, routed: false });
  });

  it("falls back to private when the LLM fails — never blocks the ask", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error("down"));
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "private", confidence: 0, routed: false });
  });

  it("strips modes the role cannot execute", async () => {
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "va" },
      impersonating: false,
    });
    mockLlm({ mode: "review_task", confidence: 0.95 });
    const res = await call({ ...validBody, coachRole: "va" });
    expect(await res.json()).toEqual({ mode: "private", routed: false });
  });
});
