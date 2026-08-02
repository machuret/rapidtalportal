/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/api-auth", () => {
  const actual = jest.requireActual("@/lib/api-auth");
  return { __esModule: true, ...actual, requireApiAuth: jest.fn() };
});

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiAuth } from "@/lib/api-auth";
import { POST as postSignal } from "@/app/api/brain/signals/route";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SIGNAL_ID = "33333333-3333-4333-8333-333333333333";
const ARTIFACT_ID = "44444444-4444-4444-8444-444444444444";
const FEEDBACK_ID = "55555555-5555-4555-8555-555555555555";
const routeCtx = { params: Promise.resolve({}) };

type Result = { data: unknown; error: unknown };

/** Chainable supabase stub: chain methods return itself, `single` and the
 *  awaited chain resolve independently (the re-rate path awaits `.limit(1)`
 *  for a row list but `.single()` after the update). */
function chain(result: Result, opts?: { single?: Result }) {
  const c: Record<string, jest.Mock> & { then?: PromiseLike<unknown>["then"] } = {};
  for (const method of ["select", "eq", "order", "limit", "insert", "update"]) {
    c[method] = jest.fn(() => c);
  }
  c.single = jest.fn().mockResolvedValue(opts?.single ?? result);
  c.maybeSingle = jest.fn().mockResolvedValue(opts?.single ?? result);
  c.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function tables(stubs: Record<string, ReturnType<typeof chain>>) {
  const from = jest.fn((table: string) => {
    const stub = stubs[table];
    if (!stub) throw new Error(`Unexpected table: ${table}`);
    return stub;
  });
  (createAdminClient as jest.Mock).mockReturnValue({ from });
  return from;
}

function postBody(body: Record<string, unknown>) {
  return postSignal(new NextRequest("https://rapidtal.online/api/brain/signals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), routeCtx);
}

const downvote = (context: Record<string, unknown>) => ({
  client_id: CLIENT_ID,
  surface: "vault_answer",
  artifact_text: "The answer the user rejected.",
  rating: -1,
  context,
});

describe("Brain signals → vault_feedback review queue dual-write", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    (requireApiAuth as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, client_id: CLIENT_ID, role: "client_admin" },
      impersonating: false,
    });
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
  });

  it("queues a team-visible 👎 on a Vault answer for review", async () => {
    const signals = chain({ data: null, error: null }, { single: { data: { id: SIGNAL_ID }, error: null } });
    const feedback = chain({ data: [], error: null });
    tables({ brain_signals: signals, vault_feedback: feedback });

    const response = await postBody(downvote({
      question: "What services do we offer?",
      sources: [{ kind: "vault", title: "Services doc" }],
    }));

    expect(response.status).toBe(201);
    expect(feedback.insert).toHaveBeenCalledWith(expect.objectContaining({
      client_id: CLIENT_ID,
      user_id: USER_ID,
      question: "What services do we offer?",
      answer: "The answer the user rejected.",
      rating: -1,
      resolved: false,
      sources: [{ kind: "vault", title: "Services doc" }],
    }));
  });

  it("caps the queued question at 2000 characters", async () => {
    const signals = chain({ data: null, error: null }, { single: { data: { id: SIGNAL_ID }, error: null } });
    const feedback = chain({ data: [], error: null });
    tables({ brain_signals: signals, vault_feedback: feedback });

    const response = await postBody(downvote({ question: "q".repeat(2500) }));

    expect(response.status).toBe(201);
    expect(feedback.insert).toHaveBeenCalledWith(expect.objectContaining({
      question: "q".repeat(2000),
    }));
  });

  it("never queues private Coach feedback into the team review queue", async () => {
    const signals = chain({ data: null, error: null }, { single: { data: { id: SIGNAL_ID }, error: null } });
    const from = tables({ brain_signals: signals });

    const response = await postBody(downvote({
      visibility: "private_coach",
      question: "A private question",
      sources: [],
    }));

    expect(response.status).toBe(201);
    expect(from).not.toHaveBeenCalledWith("vault_feedback");
  });

  it("skips the queue for positive ratings and other surfaces", async () => {
    const signals = chain({ data: null, error: null }, { single: { data: { id: SIGNAL_ID }, error: null } });
    const from = tables({ brain_signals: signals });

    // 👍 on a Vault answer is learning signal only — the review queue is 👎 triage.
    const thumbsUp = await postBody({ ...downvote({ question: "Team question" }), rating: 1 });
    expect(thumbsUp.status).toBe(201);
    const otherSurface = await postBody({
      ...downvote({ question: "Team question" }),
      surface: "content_draft",
    });
    expect(otherSurface.status).toBe(201);
    expect(from).not.toHaveBeenCalledWith("vault_feedback");
  });

  it("updates the existing unresolved row when the same artifact is re-rated", async () => {
    const signals = chain(
      { data: [{ id: SIGNAL_ID }], error: null },
      { single: { data: { id: SIGNAL_ID }, error: null } },
    );
    const feedback = chain({ data: [{ id: FEEDBACK_ID }], error: null });
    tables({ brain_signals: signals, vault_feedback: feedback });

    const response = await postBody({
      ...downvote({ question: "What services do we offer?" }),
      artifact_id: ARTIFACT_ID,
    });

    expect(response.status).toBe(200);
    expect(feedback.update).toHaveBeenCalledWith(expect.objectContaining({ rating: -1 }));
    expect(feedback.insert).not.toHaveBeenCalled();
  });

  it("never lets a review-queue failure break the signal write", async () => {
    const signals = chain({ data: null, error: null }, { single: { data: { id: SIGNAL_ID }, error: null } });
    const feedback = chain({ data: null, error: { message: "db down" } });
    tables({ brain_signals: signals, vault_feedback: feedback });

    const response = await postBody(downvote({ question: "What services do we offer?" }));

    expect(response.status).toBe(201);
    expect(console.error).toHaveBeenCalledWith(
      "[brain/signals vault_feedback dual-write]",
      expect.objectContaining({ message: "db down" }),
    );
  });
});
