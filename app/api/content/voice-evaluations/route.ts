import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { chatModel, chatProvider } from "@/lib/brain/llm";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { errorMessage } from "@/lib/error-message";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import {
  STYLE_ANALYSIS_CHANNELS,
  styleAnalysisProfileSchema,
  type StyleAnalysisProfile,
} from "@/lib/content/style-analysis";
import {
  deterministicVoiceMetrics,
  type ContentGoldenExample,
} from "@/lib/content/voice-calibration";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const maxDuration = 120;

const querySchema = z.object({ client_id: z.string().uuid() });
const createSchema = z.object({
  client_id: z.string().uuid(),
  channel: z.enum(STYLE_ANALYSIS_CHANNELS),
  title: z.string().trim().min(3).max(300),
  objective: z.string().trim().min(10).max(4000),
  audience: z.string().trim().min(2).max(1000),
  tone: z.enum([
    "professional", "friendly", "persuasive", "casual",
    "authoritative", "warm", "direct", "playful",
  ]).default("professional"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
});
const reviewSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  preferred_variant: z.enum(["a", "b", "tie"]),
  reviewer_notes: z.string().trim().max(4000).default(""),
});

function canManage(role: string): boolean {
  return hasContentCapability(role, "edit_style_profiles");
}

interface EdgeDraft {
  body?: string;
  warnings?: string[];
  error?: string;
}

interface JudgeResult {
  variant_a: {
    voiceTraitAdherence: number;
    channelFit: number;
    vocabularyFit: number;
    genericnessRisk: number;
    reasons: string[];
  };
  variant_b: {
    voiceTraitAdherence: number;
    channelFit: number;
    vocabularyFit: number;
    genericnessRisk: number;
    reasons: string[];
  };
}

const judgeSchema = z.object({
  variant_a: z.object({
    voiceTraitAdherence: z.number().min(0).max(100),
    channelFit: z.number().min(0).max(100),
    vocabularyFit: z.number().min(0).max(100),
    genericnessRisk: z.number().min(0).max(100),
    reasons: z.array(z.string().max(500)).max(8),
  }),
  variant_b: z.object({
    voiceTraitAdherence: z.number().min(0).max(100),
    channelFit: z.number().min(0).max(100),
    vocabularyFit: z.number().min(0).max(100),
    genericnessRisk: z.number().min(0).max(100),
    reasons: z.array(z.string().max(500)).max(8),
  }),
});

async function evaluateBlindly(args: {
  channel: string;
  profile: StyleAnalysisProfile;
  goldens: ContentGoldenExample[];
  variantA: string;
  variantB: string;
}): Promise<JudgeResult | null> {
  const provider = chatProvider();
  if (!provider) return null;
  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify({
      model: chatModel("CONTENT_VOICE_EVAL_MODEL"),
      temperature: 0,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a blind editorial evaluator. Compare anonymous drafts A and B against the supplied approved, permissioned client examples and approved style profile for one channel. Evaluate observable voice traits, channel fit, vocabulary fit and genericness. Do not infer which system produced either draft. Do not reward copying; exact phrase reuse is a defect. Return JSON only with variant_a and variant_b, each containing voiceTraitAdherence, channelFit, vocabularyFit and genericnessRisk scores from 0 to 100 plus concise reasons.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            channel: args.channel,
            approvedStyleProfile: args.profile,
            evaluationExamples: args.goldens.map((golden) => ({
              title: golden.title,
              body: golden.body,
              voiceTraits: golden.voice_traits,
              structuralTraits: golden.structural_traits,
              vocabularyPreferences: golden.vocabulary_preferences,
            })),
            variant_a: args.variantA,
            variant_b: args.variantB,
          }),
        },
      ],
    }),
  });
  const raw = await response.json();
  if (!response.ok) throw new Error(raw?.error?.message ?? "Blind evaluator failed.");
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Blind evaluator returned no result.");
  return judgeSchema.parse(JSON.parse(content));
}

async function edgeDraft(body: Record<string, unknown>): Promise<EdgeDraft> {
  const response = await proxyToEdgeFunction("content-generate", body);
  const payload = await response.json() as EdgeDraft;
  if (!response.ok || typeof payload.body !== "string" || !payload.body.trim()) {
    throw new Error(errorMessage(payload, "A voice-evaluation draft could not be generated."));
  }
  return payload;
}

function reveal(row: Record<string, unknown>): Record<string, unknown> {
  if (row.status !== "reviewed") {
    const safe = { ...row };
    delete safe.assignment;
    return safe;
  }
  const assignment = row.assignment as { a?: string; b?: string };
  const preference = row.preferred_variant;
  return {
    ...row,
    assignment: undefined,
    revealed_winner: preference === "tie"
      ? "tie"
      : preference === "a"
        ? assignment.a ?? null
        : assignment.b ?? null,
    revealed_assignment: {
      variant_a: assignment.a ?? null,
      variant_b: assignment.b ?? null,
    },
  };
}

export const GET = withAuth(async (request, { user }) => {
  const parsed = querySchema.safeParse({
    client_id: request.nextUrl.searchParams.get("client_id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "A valid client is required." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_voice_evaluations")
    .select("id,client_id,channel,status,brief,variant_a,variant_b,assignment,automated_evaluation,preferred_variant,reviewer_notes,reviewed_at,created_at")
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return serverError(error);
  return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(reveal));
});

export const POST = withAuth(async (request, { user }) => {
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Only client admins and super admins can run voice evaluations." }, { status: 403 });
  }
  const rateLimit = aiGenerateLimiter.check(`voice-evaluation:${user.id}`);
  if (!rateLimit.allowed) return tooManyRequests(rateLimit.retryAfterSeconds);
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [{ data: goldenRows, error: goldenError }, { data: styleRow, error: styleError }, { data: competitorRows, error: competitorError }] = await Promise.all([
    db.from("content_golden_examples")
      .select("id,client_id,channel,title,body,source_url,published_at,content_type,represents_brand_strongly,voice_traits,structural_traits,vocabulary_preferences,admin_notes,evaluation_permission,status,content_hash,approved_at,created_at,updated_at")
      .eq("client_id", parsed.data.client_id)
      .eq("channel", parsed.data.channel)
      .eq("status", "approved")
      .eq("evaluation_permission", true)
      .eq("represents_brand_strongly", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(12),
    db.from("content_style_analyses")
      .select("id,analysis")
      .eq("client_id", parsed.data.client_id)
      .eq("channel", parsed.data.channel)
      .eq("status", "approved")
      .maybeSingle(),
    db.from("competitor_content_items")
      .select("raw_content")
      .eq("client_id", parsed.data.client_id)
      .eq("is_removed", false)
      .limit(40),
  ]);
  if (goldenError || styleError || competitorError) {
    return NextResponse.json({ error: "Voice evaluation evidence could not be loaded." }, { status: 503 });
  }
  const goldens = (goldenRows ?? []) as ContentGoldenExample[];
  const profileResult = styleRow?.analysis
    ? styleAnalysisProfileSchema.safeParse(styleRow.analysis)
    : null;
  if (goldens.length < 5) {
    return NextResponse.json({
      error: `Approve at least five representative, permissioned ${parsed.data.channel} goldens before running a blind evaluation.`,
    }, { status: 422 });
  }
  if (!profileResult?.success) {
    return NextResponse.json({ error: "Approve a valid channel style profile before running a blind evaluation." }, { status: 422 });
  }

  const brief = {
    version: 1,
    objective: parsed.data.objective,
    audience: parsed.data.audience,
    tone: parsed.data.tone,
    length: parsed.data.length,
    additionalGuidance: "This is a private blind voice-calibration draft. Do not mention the evaluation.",
  };
  const conditionedIsA = randomInt(0, 2) === 0;
  const assignment = conditionedIsA
    ? { a: "conditioned", b: "baseline" }
    : { a: "baseline", b: "conditioned" };
  const { data: evaluation, error: insertError } = await db
    .from("content_voice_evaluations")
    .insert({
      client_id: parsed.data.client_id,
      channel: parsed.data.channel,
      status: "running",
      brief: { title: parsed.data.title, ...brief },
      golden_example_ids: goldens.map((golden) => golden.id),
      style_analysis_id: styleRow.id,
      assignment,
      created_by: user.id,
      model: chatModel("CONTENT_VOICE_EVAL_MODEL"),
    })
    .select("id")
    .single();
  if (insertError) return serverError(insertError);

  try {
    const common = {
      clientId: parsed.data.client_id,
      contentType: parsed.data.channel,
      title: parsed.data.title,
      brief,
      persist: false,
    };
    const [conditioned, baseline] = await Promise.all([
      edgeDraft({ ...common, evaluationStyleMode: "conditioned" }),
      edgeDraft({ ...common, evaluationStyleMode: "baseline" }),
    ]);
    const variantA = conditionedIsA ? conditioned : baseline;
    const variantB = conditionedIsA ? baseline : conditioned;
    const competitorBodies = (competitorRows ?? [])
      .map((row: { raw_content?: unknown }) => row.raw_content)
      .filter((value: unknown): value is string => typeof value === "string");
    const [judge, metricsA, metricsB] = await Promise.all([
      evaluateBlindly({
        channel: parsed.data.channel,
        profile: profileResult.data,
        goldens,
        variantA: variantA.body!,
        variantB: variantB.body!,
      }),
      Promise.resolve(deterministicVoiceMetrics({
        body: variantA.body!,
        goldens,
        competitorBodies,
        warnings: variantA.warnings ?? [],
      })),
      Promise.resolve(deterministicVoiceMetrics({
        body: variantB.body!,
        goldens,
        competitorBodies,
        warnings: variantB.warnings ?? [],
      })),
    ]);
    const automatedEvaluation = {
      rubricVersion: 1,
      evaluator: judge ? "blind-model-plus-deterministic-safety" : "deterministic-safety",
      variant_a: { ...metricsA, modelJudge: judge?.variant_a ?? null },
      variant_b: { ...metricsB, modelJudge: judge?.variant_b ?? null },
    };
    const { data: completed, error: updateError } = await db
      .from("content_voice_evaluations")
      .update({
        status: "ready",
        variant_a: variantA.body,
        variant_b: variantB.body,
        automated_evaluation: automatedEvaluation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", evaluation.id)
      .eq("client_id", parsed.data.client_id)
      .eq("status", "running")
      .select("id,client_id,channel,status,brief,variant_a,variant_b,automated_evaluation,preferred_variant,reviewer_notes,reviewed_at,created_at")
      .single();
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json(completed, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice evaluation failed.";
    await db.from("content_voice_evaluations")
      .update({ status: "failed", error: message.slice(0, 4000), updated_at: new Date().toISOString() })
      .eq("id", evaluation.id)
      .eq("client_id", parsed.data.client_id)
      .eq("status", "running");
    return NextResponse.json({ error: message }, { status: 502 });
  }
});

export const PATCH = withAuth(async (request, { user }) => {
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Only client admins and super admins can submit blind reviews." }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("review_content_voice_evaluation", {
    p_client_id: parsed.data.client_id,
    p_evaluation_id: parsed.data.id,
    p_actor_id: user.id,
    p_preferred_variant: parsed.data.preferred_variant,
    p_reviewer_notes: parsed.data.reviewer_notes,
  }).single();
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 409 : 422;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(reveal(data as Record<string, unknown>));
});
