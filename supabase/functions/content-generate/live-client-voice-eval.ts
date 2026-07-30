import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runContentGenerationOrchestration,
  type ContentModelRequest,
} from "../_shared/content-generation-orchestration.ts";
import { resolveContentStyle } from "../_shared/content-style.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const apiKey = Deno.env.get("OPENROUTER_API_KEY");
const model = Deno.env.get("CONTENT_EVAL_MODEL") ?? "openai/gpt-4o-mini";
const requirePilot = Deno.env.get("CONTENT_EVAL_REQUIRE_PILOT") === "1";
const minimumHumanReviews = Number(Deno.env.get("CONTENT_EVAL_MIN_REVIEWS") ?? "20");
if (!supabaseUrl || !serviceKey || !apiKey) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENROUTER_API_KEY are required.");
}
const admin = createClient(supabaseUrl, serviceKey);

interface Golden {
  id: string;
  client_id: string;
  channel: "linkedin" | "facebook" | "instagram" | "x" | "email" | "blog" | "newsletter";
  title: string;
  body: string;
  voice_traits: string[];
  structural_traits: string[];
  vocabulary_preferences: string[];
}

async function complete(request: ContentModelRequest): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
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

function wordNgrams(value: string, size: number): Set<string> {
  const tokens = value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const result = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

function longestSharedPhrase(body: string, comparisons: string[]): number {
  for (let size = 20; size >= 6; size -= 1) {
    const generated = wordNgrams(body, size);
    const references = new Set(comparisons.flatMap((value) => [...wordNgrams(value, size)]));
    if ([...generated].some((phrase) => references.has(phrase))) return size;
  }
  return 0;
}

async function blindJudge(args: {
  channel: string;
  goldens: Golden[];
  variantA: string;
  variantB: string;
}): Promise<Record<string, unknown>> {
  const raw = await complete({
    phase: "critique",
    maxTokens: 1200,
    temperature: 0,
    json: true,
    system: `You are a blind company-voice evaluator. Score anonymous drafts A and B from 0 to 100 for voice-trait adherence, channel fit, structural similarity, vocabulary fit and genericness risk. Use only observable patterns in the approved examples. Penalise copying. Return JSON with variant_a and variant_b score objects; do not guess which system generated them.`,
    user: JSON.stringify({
      channel: args.channel,
      approvedExamples: args.goldens.map((golden) => ({
        body: golden.body,
        voiceTraits: golden.voice_traits,
        structuralTraits: golden.structural_traits,
        vocabularyPreferences: golden.vocabulary_preferences,
      })),
      variant_a: args.variantA,
      variant_b: args.variantB,
    }),
  });
  return JSON.parse(raw) as Record<string, unknown>;
}

const { data: goldenRows, error: goldenError } = await admin
  .from("content_golden_examples")
  .select("id,client_id,channel,title,body,voice_traits,structural_traits,vocabulary_preferences")
  .eq("status", "approved")
  .eq("evaluation_permission", true)
  .eq("represents_brand_strongly", true)
  .order("published_at", { ascending: false, nullsFirst: false });
if (goldenError) throw goldenError;

const groups = new Map<string, Golden[]>();
for (const golden of (goldenRows ?? []) as Golden[]) {
  const key = `${golden.client_id}:${golden.channel}`;
  groups.set(key, [...(groups.get(key) ?? []), golden].slice(0, 12));
}
const eligible = [...groups.entries()]
  .filter(([, goldens]) => goldens.length >= 5)
  .map(([key, goldens]) => {
    const [clientId, channel] = key.split(":");
    return { clientId, channel: channel as Golden["channel"], goldens };
  });
const channelsPerClient = new Map<string, number>();
for (const candidate of eligible) {
  channelsPerClient.set(candidate.clientId, (channelsPerClient.get(candidate.clientId) ?? 0) + 1);
}
const pilotClients = [...channelsPerClient].filter(([, channelCount]) => channelCount >= 2).slice(0, 6);
console.log(JSON.stringify({
  event: "real-client-voice-pilot-readiness",
  eligibleClientsWithTwoChannels: pilotClients.length,
  target: "4-6 clients with at least two sampled channels",
}));
if (requirePilot && pilotClients.length < 4) {
  throw new Error(`Real-client voice pilot is not ready: ${pilotClients.length}/4 eligible clients.`);
}

let failures = 0;
for (const [clientId] of pilotClients) {
  const clientGroups = eligible.filter((candidate) => candidate.clientId === clientId).slice(0, 2);
  for (const candidate of clientGroups) {
    const [{ data: dna, error: dnaError }, { data: style, error: styleError }, { data: competitors }] = await Promise.all([
      admin.from("company_dna").select("*").eq("client_id", clientId).maybeSingle(),
      admin.from("content_style_analyses")
        .select("id,channel,analysis,source_item_ids,source_evidence,analysed_at,approved_at")
        .eq("client_id", clientId)
        .eq("channel", candidate.channel)
        .eq("status", "approved")
        .maybeSingle(),
      admin.from("competitor_content_items")
        .select("raw_content")
        .eq("client_id", clientId)
        .eq("is_removed", false)
        .limit(80),
    ]);
    if (dnaError || styleError || !dna || !style) {
      console.log(JSON.stringify({ clientId, channel: candidate.channel, skipped: "missing-dna-or-approved-style" }));
      failures += 1;
      continue;
    }

    const brief = {
      version: 1,
      objective: `Create an original ${candidate.channel} piece inspired by the audience territory of "${candidate.goldens[0].title}", without copying or inventing facts.`,
      audience: "The established audience demonstrated by the approved client examples",
      tone: "professional",
      length: "medium",
      additionalGuidance: "This is an evaluation draft. Use no unsupported company, market or performance claims.",
    };
    const context = `=== COMPANY CONTEXT ===\n${JSON.stringify(dna, null, 2)}`;
    const conditionedDna = {
      ...dna,
      style_analysis_profiles: { [candidate.channel]: style },
    };
    const baselineDna = { ...dna, style_analysis_profiles: {} };
    const [conditioned, baseline] = await Promise.all([
      runContentGenerationOrchestration({
        contentType: candidate.channel,
        title: candidate.goldens[0].title,
        contentBrief: brief,
        context,
        style: resolveContentStyle(conditionedDna, candidate.channel, "professional", ""),
        dna: conditionedDna,
        sources: [],
        complete,
      }),
      runContentGenerationOrchestration({
        contentType: candidate.channel,
        title: candidate.goldens[0].title,
        contentBrief: brief,
        context,
        style: resolveContentStyle(baselineDna, candidate.channel, "professional", ""),
        dna: baselineDna,
        sources: [],
        complete,
      }),
    ]);
    const conditionedIsA = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
    const variantA = conditionedIsA ? conditioned : baseline;
    const variantB = conditionedIsA ? baseline : conditioned;
    const judge = await blindJudge({
      channel: candidate.channel,
      goldens: candidate.goldens,
      variantA: variantA.finalBody,
      variantB: variantB.finalBody,
    });
    const comparisonBodies = [
      ...candidate.goldens.map((golden) => golden.body),
      ...(competitors ?? []).map((row: { raw_content: string }) => row.raw_content),
    ];
    const deterministic = {
      variant_a: {
        hardRulesPass: variantA.qualityWarnings.length === 0,
        warnings: variantA.qualityWarnings,
        longestSharedPhraseWords: longestSharedPhrase(variantA.finalBody, comparisonBodies),
      },
      variant_b: {
        hardRulesPass: variantB.qualityWarnings.length === 0,
        warnings: variantB.qualityWarnings,
        longestSharedPhraseWords: longestSharedPhrase(variantB.finalBody, comparisonBodies),
      },
    };
    const passed =
      deterministic.variant_a.hardRulesPass &&
      deterministic.variant_b.hardRulesPass &&
      deterministic.variant_a.longestSharedPhraseWords < 12 &&
      deterministic.variant_b.longestSharedPhraseWords < 12;
    const { error: saveError } = await admin.from("content_voice_evaluations").insert({
      client_id: clientId,
      channel: candidate.channel,
      status: "ready",
      brief: { title: candidate.goldens[0].title, ...brief, scheduled: true },
      golden_example_ids: candidate.goldens.map((golden) => golden.id),
      style_analysis_id: style.id,
      variant_a: variantA.finalBody,
      variant_b: variantB.finalBody,
      assignment: conditionedIsA ? { a: "conditioned", b: "baseline" } : { a: "baseline", b: "conditioned" },
      automated_evaluation: { rubricVersion: 1, modelJudge: judge, deterministic, scheduled: true },
      model,
    });
    if (saveError) throw saveError;
    console.log(JSON.stringify({ clientId, channel: candidate.channel, passed, deterministic }));
    if (!passed) failures += 1;
  }
}
if (failures) throw new Error(`${failures} scheduled real-client voice evaluation(s) failed safety checks.`);

if (requirePilot) {
  const pilotClientIds = pilotClients.map(([clientId]) => clientId);
  const reviewWindow = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: reviews, error: reviewError } = await admin
    .from("content_voice_evaluations")
    .select("assignment,preferred_variant,reviewed_at")
    .in("client_id", pilotClientIds)
    .eq("status", "reviewed")
    .not("preferred_variant", "is", null)
    .gte("reviewed_at", reviewWindow);
  if (reviewError) throw reviewError;

  const decided = (reviews ?? []).filter((review) =>
    review.preferred_variant === "a" || review.preferred_variant === "b"
  );
  const conditionedWins = decided.filter((review) => {
    const assignment = review.assignment as Record<string, unknown>;
    return assignment[review.preferred_variant as "a" | "b"] === "conditioned";
  }).length;
  const preferenceRate = decided.length ? conditionedWins / decided.length : 0;
  console.log(JSON.stringify({
    event: "real-client-human-preference-gate",
    reviewWindowDays: 90,
    decidedReviews: decided.length,
    minimumHumanReviews,
    conditionedWins,
    preferenceRate,
    threshold: 0.8,
  }));
  if (!Number.isInteger(minimumHumanReviews) || minimumHumanReviews < 1) {
    throw new Error("CONTENT_EVAL_MIN_REVIEWS must be a positive integer.");
  }
  if (decided.length < minimumHumanReviews) {
    throw new Error(
      `Real-client voice pilot needs ${minimumHumanReviews} decided blind reviews; only ${decided.length} exist in the last 90 days.`,
    );
  }
  if (preferenceRate < 0.8) {
    throw new Error(
      `Style-conditioned drafts won ${(preferenceRate * 100).toFixed(1)}% of decided blind reviews; 80% is required.`,
    );
  }
}
