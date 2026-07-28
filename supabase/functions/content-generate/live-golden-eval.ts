import { COMPANY_VOICE_GOLDENS } from "../../../__fixtures__/content-golden-examples.ts";
import {
  runContentGenerationOrchestration,
  type ContentModelRequest,
} from "../_shared/content-generation-orchestration.ts";
import { resolveContentStyle } from "../_shared/content-style.ts";

const apiKey = Deno.env.get("OPENROUTER_API_KEY");
const model = Deno.env.get("CONTENT_EVAL_MODEL") ?? "openai/gpt-4o-mini";
if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the scheduled content golden evaluation.");

async function openRouter(request: ContentModelRequest): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.3,
      ...(request.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message ?? `OpenRouter returned ${response.status}`);
  return json.choices?.[0]?.message?.content ?? "";
}

async function judgeVoice(args: {
  companyVoice: string;
  contentType: string;
  dna: Record<string, unknown>;
  body: string;
}): Promise<{ score: number; reasons: string[] }> {
  const raw = await openRouter({
    phase: "critique",
    maxTokens: 800,
    temperature: 0,
    json: true,
    system: `You are evaluating a content-generation regression test. Score the draft from 0 to 10 for adherence to the supplied Company DNA voice and the requested platform. Penalise generic filler, voice mismatch, hard-rule violations and incorrect platform structure. Do not reward factual detail that was not supplied. Return JSON only: {"score": number, "reasons": string[]}.`,
    user: `Target voice: ${args.companyVoice}\nPlatform: ${args.contentType}\nCompany DNA:\n${JSON.stringify(args.dna, null, 2)}\n\nDraft:\n${args.body}`,
  });
  const parsed = JSON.parse(raw);
  return {
    score: typeof parsed.score === "number" ? parsed.score : 0,
    reasons: Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((item: unknown) => typeof item === "string").slice(0, 6)
      : [],
  };
}

let failures = 0;
for (const golden of COMPANY_VOICE_GOLDENS) {
  const style = resolveContentStyle(
    golden.dna,
    golden.contentType,
    golden.requestedTone,
    golden.lengthHint,
  );
  const contentBrief = {
    version: 1,
    objective: golden.objective,
    tone: golden.requestedTone,
    length: golden.contentType === "blog" ? "long" : "medium",
  };
  const result = await runContentGenerationOrchestration({
    contentType: golden.contentType,
    title: golden.objective,
    contentBrief,
    context: `=== COMPANY CONTEXT ===\n${JSON.stringify(golden.dna, null, 2)}`,
    style,
    dna: golden.dna,
    sources: [],
    complete: openRouter,
  });
  const judge = await judgeVoice({
    companyVoice: golden.companyVoice,
    contentType: golden.contentType,
    dna: golden.dna,
    body: result.finalBody,
  });
  const passed = result.qualityWarnings.length === 0 && judge.score >= 8;
  console.log(JSON.stringify({
    id: golden.id,
    passed,
    score: judge.score,
    warnings: result.qualityWarnings,
    reasons: judge.reasons,
  }));
  if (!passed) failures += 1;
}

if (failures) {
  throw new Error(`${failures} live content golden evaluation(s) failed.`);
}
