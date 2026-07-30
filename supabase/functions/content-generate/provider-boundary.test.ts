import {
  ContentGenerationFailure,
  requestContentModel,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const request = {
  phase: "draft" as const,
  system: "System instructions",
  user: "Write the draft",
  maxTokens: 500,
};

Deno.test("content model request uses configured model and an abort signal", async () => {
  let submittedModel = "";
  let receivedSignal = false;
  const content = await requestContentModel({
    request,
    apiKey: "test-key",
    model: "provider/configured-model",
    timeoutMs: 5_000,
    fetchImpl: (async (_url: URL | RequestInfo, init?: RequestInit) => {
      receivedSignal = init?.signal instanceof AbortSignal;
      submittedModel = JSON.parse(String(init?.body)).model;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "A safe generated draft." } }],
      }), { status: 200 });
    }) as typeof fetch,
  });

  assert(content === "A safe generated draft.", "provider content was not returned");
  assert(submittedModel === "provider/configured-model", "configured model was ignored");
  assert(receivedSignal, "provider request was not abortable");
});

Deno.test("content model timeout returns only a safe public error", async () => {
  try {
    await requestContentModel({
      request,
      apiKey: "test-key",
      model: "provider/configured-model",
      timeoutMs: 1,
      fetchImpl: ((_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("internal timeout detail", "AbortError"));
          });
        })) as typeof fetch,
    });
    throw new Error("timeout request unexpectedly succeeded");
  } catch (error) {
    assert(error instanceof ContentGenerationFailure, "timeout did not use the safe error type");
    assert(error.status === 504, "timeout did not return the expected status");
    assert(error.code === "provider_timeout", "timeout did not return the expected code");
    assert(!error.message.includes("internal timeout detail"), "timeout leaked internal detail");
  }
});

Deno.test("provider response messages are never returned to callers", async () => {
  const secretProviderMessage = "account 123 has exhausted secret upstream credits";
  try {
    await requestContentModel({
      request,
      apiKey: "test-key",
      model: "provider/configured-model",
      timeoutMs: 5_000,
      fetchImpl: (async () => new Response(JSON.stringify({
        error: { message: secretProviderMessage },
      }), { status: 402 })) as typeof fetch,
    });
    throw new Error("rejected provider request unexpectedly succeeded");
  } catch (error) {
    assert(error instanceof ContentGenerationFailure, "provider rejection did not use the safe error type");
    assert(error.status === 502, "provider rejection did not return the expected status");
    assert(!error.message.includes(secretProviderMessage), "provider detail leaked to the caller");
  }
});
