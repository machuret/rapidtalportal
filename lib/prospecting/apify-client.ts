import type { ApifyActorRun, StartApifyActorRunOptions } from "@/lib/prospecting/types";

const APIFY_API_ORIGIN = "https://api.apify.com";

export class ApifyClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly requestMayHaveStarted = false,
  ) {
    super(message);
    this.name = "ApifyClientError";
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function apifyToken(): string {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new ApifyClientError("Lead collection is not configured.", 503, false);
  return token;
}

function actorPath(actorId: string): string {
  const normalized = actorId.trim().replace(/\//gu, "~");
  if (!/^[a-z0-9][a-z0-9._-]*~[a-z0-9][a-z0-9._-]*$/iu.test(normalized)) {
    throw new ApifyClientError("The lead provider is not configured correctly.", 500, false);
  }
  return encodeURIComponent(normalized);
}

function publicProviderError(status: number): string {
  if (status === 401 || status === 403) return "Lead collection is not configured correctly.";
  if (status === 408) return "The lead provider timed out. Try again.";
  if (status === 429) return "The lead provider is busy. Collection will retry automatically.";
  if (status >= 500) return "The lead provider is temporarily unavailable. Collection will retry automatically.";
  return "The lead provider rejected this collection request.";
}

async function apifyJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${APIFY_API_ORIGIN}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apifyToken()}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: init?.signal ?? AbortSignal.timeout(
        Math.min(positiveInteger(process.env.APIFY_HTTP_TIMEOUT_MS, 30_000), 120_000),
      ),
    });
  } catch (error) {
    if (error instanceof ApifyClientError) throw error;
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ApifyClientError("The lead provider timed out. Try the job again.", 504, true, init?.method === "POST");
    }
    throw new ApifyClientError("The lead provider could not be reached. Try again.", 502, true, init?.method === "POST");
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApifyClientError(
      publicProviderError(response.status),
      response.status === 429 ? 429 : 502,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  return json;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseRun(value: unknown): ApifyActorRun {
  const envelope = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const data = envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
    ? envelope.data as Record<string, unknown>
    : envelope;
  if (typeof data.id !== "string" || typeof data.actId !== "string" || typeof data.status !== "string") {
    throw new ApifyClientError("The lead provider returned an invalid run response.", 502, true);
  }
  const usageTotalUsd = data.usageTotalUsd;
  return {
    id: data.id,
    actId: data.actId,
    status: data.status as ApifyActorRun["status"],
    defaultDatasetId: nullableString(data.defaultDatasetId),
    startedAt: nullableString(data.startedAt),
    finishedAt: nullableString(data.finishedAt),
    buildId: nullableString(data.buildId),
    usageTotalUsd: typeof usageTotalUsd === "number" && Number.isFinite(usageTotalUsd)
      ? usageTotalUsd
      : null,
  };
}

export async function startApifyActorRun(options: StartApifyActorRunOptions): Promise<ApifyActorRun> {
  if (!Number.isInteger(options.maxItems) || options.maxItems < 1 || options.maxItems > 500) {
    throw new ApifyClientError("Lead runs must request between 1 and 500 items.", 422, false);
  }
  if (!Number.isFinite(options.maxTotalChargeUsd)
    || options.maxTotalChargeUsd < 0.5
    || options.maxTotalChargeUsd > 25) {
    throw new ApifyClientError("The lead run budget must be between USD $0.50 and $25.", 422, false);
  }
  const params = new URLSearchParams({
    waitForFinish: "0",
    maxItems: String(options.maxItems),
    maxTotalChargeUsd: options.maxTotalChargeUsd.toFixed(2),
    build: options.build ?? "latest",
  });
  if (options.webhookUrl) {
    const webhooks = [{
      eventTypes: [
        "ACTOR.RUN.CREATED",
        "ACTOR.RUN.SUCCEEDED",
        "ACTOR.RUN.FAILED",
        "ACTOR.RUN.TIMED_OUT",
        "ACTOR.RUN.ABORTED",
      ],
      requestUrl: options.webhookUrl,
      ...(options.webhookIdempotencyKey ? { idempotencyKey: options.webhookIdempotencyKey } : {}),
      payloadTemplate: "{\"eventType\":{{eventType}},\"eventData\":{{eventData}},\"resource\":{{resource}}}",
    }];
    // Apify's Run Actor API requires the ad-hoc webhook array to be Base64
    // encoded inside the query parameter, not raw JSON.
    params.set("webhooks", Buffer.from(JSON.stringify(webhooks), "utf8").toString("base64"));
  }
  const json = await apifyJson(`/v2/acts/${actorPath(options.actorId)}/runs?${params}`, {
    method: "POST",
    body: JSON.stringify(options.input),
  });
  return parseRun(json);
}

export async function getApifyActorRun(runId: string): Promise<ApifyActorRun> {
  if (!/^[a-zA-Z0-9_-]{5,100}$/u.test(runId)) {
    throw new ApifyClientError("The lead run identifier is invalid.", 422, false);
  }
  return parseRun(await apifyJson(`/v2/actor-runs/${encodeURIComponent(runId)}`));
}

export async function getApifyDatasetItems(
  datasetId: string,
  options: { offset?: number; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  if (!/^[a-zA-Z0-9_-]{5,100}$/u.test(datasetId)) {
    throw new ApifyClientError("The lead dataset identifier is invalid.", 422, false);
  }
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0) {
    throw new ApifyClientError("The lead dataset page is invalid.", 422, false);
  }
  const params = new URLSearchParams({
    clean: "true",
    format: "json",
    offset: String(offset),
    limit: String(limit),
  });
  const json = await apifyJson(`/v2/datasets/${encodeURIComponent(datasetId)}/items?${params}`);
  return Array.isArray(json)
    ? json.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export async function abortApifyActorRun(runId: string): Promise<ApifyActorRun> {
  if (!/^[a-zA-Z0-9_-]{5,100}$/u.test(runId)) {
    throw new ApifyClientError("The lead run identifier is invalid.", 422, false);
  }
  return parseRun(await apifyJson(`/v2/actor-runs/${encodeURIComponent(runId)}/abort`, {
    method: "POST",
  }));
}
