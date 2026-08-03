import {
  abortApifyActorRun,
  ApifyClientError,
  getApifyActorRun,
  getApifyDatasetItems,
  startApifyActorRun,
} from "@/lib/prospecting/apify-client";

const originalToken = process.env.APIFY_API_TOKEN;

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("prospecting Apify client", () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = "test-apify-token";
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.APIFY_API_TOKEN;
    else process.env.APIFY_API_TOKEN = originalToken;
  });

  test("starts an asynchronous Actor run with hard item and spend limits", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({
      data: {
        id: "run12345",
        actId: "actor12345",
        status: "READY",
        defaultDatasetId: "dataset12345",
        startedAt: "2026-08-03T00:00:00.000Z",
        finishedAt: null,
        buildId: "build12345",
      },
    }));

    const run = await startApifyActorRun({
      actorId: "compass/crawler-google-places",
      input: { searchStringsArray: ["mortgage broker"] },
      maxItems: 10,
      maxTotalChargeUsd: 0.5,
      build: "latest",
      webhookUrl: "https://portal.example/api/webhooks/prospecting/apify?jobId=one",
      webhookIdempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(run).toEqual(expect.objectContaining({
      id: "run12345",
      status: "READY",
      defaultDatasetId: "dataset12345",
    }));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v2/acts/compass~crawler-google-places/runs?");
    expect(url).toContain("waitForFinish=0");
    expect(url).toContain("maxItems=10");
    expect(url).toContain("maxTotalChargeUsd=0.50");
    expect(url).toContain("webhooks=");
    const webhookParam = new URL(url).searchParams.get("webhooks");
    expect(JSON.parse(Buffer.from(webhookParam!, "base64").toString("utf8"))).toEqual([
      expect.objectContaining({
        requestUrl: "https://portal.example/api/webhooks/prospecting/apify?jobId=one",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        eventTypes: expect.arrayContaining(["ACTOR.RUN.CREATED", "ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.ABORTED"]),
      }),
    ]);
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: "Bearer test-apify-token",
      "Content-Type": "application/json",
    }));
  });

  test("rejects unsafe run budgets before calling the provider", async () => {
    await expect(startApifyActorRun({
      actorId: "compass~crawler-google-places",
      input: {},
      maxItems: 501,
      maxTotalChargeUsd: 0.5,
    })).rejects.toEqual(expect.objectContaining({ status: 422, retryable: false }));
    await expect(startApifyActorRun({
      actorId: "compass~crawler-google-places",
      input: {},
      maxItems: 10,
      maxTotalChargeUsd: 50,
    })).rejects.toEqual(expect.objectContaining({ status: 422, retryable: false }));
    await expect(startApifyActorRun({
      actorId: "compass~crawler-google-places",
      input: {},
      maxItems: 10,
      maxTotalChargeUsd: 0.49,
    })).rejects.toEqual(expect.objectContaining({ status: 422, retryable: false }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("polls runs, pages datasets and can cancel a run", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ data: { id: "run12345", actId: "actor1", status: "RUNNING" } }))
      .mockResolvedValueOnce(response([{ title: "One" }, null, "invalid", { title: "Two" }]))
      .mockResolvedValueOnce(response({ data: { id: "run12345", actId: "actor1", status: "ABORTING" } }));

    await expect(getApifyActorRun("run12345")).resolves.toEqual(expect.objectContaining({ status: "RUNNING" }));
    await expect(getApifyDatasetItems("dataset12345", { offset: 10, limit: 20 })).resolves.toEqual([
      { title: "One" },
      { title: "Two" },
    ]);
    await expect(abortApifyActorRun("run12345")).resolves.toEqual(expect.objectContaining({ status: "ABORTING" }));
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain("offset=10&limit=20");
    expect((global.fetch as jest.Mock).mock.calls[2][1]).toEqual(expect.objectContaining({ method: "POST" }));
  });

  test("turns timeouts and provider failures into recoverable errors", async () => {
    const timeout = new Error("timeout");
    timeout.name = "TimeoutError";
    (global.fetch as jest.Mock).mockRejectedValueOnce(timeout);
    await expect(getApifyActorRun("run12345")).rejects.toEqual(expect.objectContaining({
      status: 504,
      retryable: true,
      message: "The lead provider timed out. Try the job again.",
    }));

    (global.fetch as jest.Mock).mockResolvedValueOnce(response({ error: { message: "rate limited" } }, 429));
    await expect(getApifyActorRun("run12345")).rejects.toEqual(expect.objectContaining({
      status: 429,
      retryable: true,
      message: "The lead provider is busy. Collection will retry automatically.",
    }));
  });

  test("fails clearly when the token is unavailable", async () => {
    delete process.env.APIFY_API_TOKEN;
    await expect(getApifyActorRun("run12345")).rejects.toEqual(new ApifyClientError(
      "Lead collection is not configured.",
      503,
      false,
    ));
  });
});
