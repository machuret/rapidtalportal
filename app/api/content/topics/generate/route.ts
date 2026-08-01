import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPrompt } from "@/lib/prompts/server";
import {
  persistNodeBrainContextSnapshot,
  resolveNodeBrainContext,
} from "@/lib/brain/resolver";
import { cosine, embeddingFit, embedTexts } from "@/lib/brain/embed";
import { logBrainEvent } from "@/lib/brain/events";
import { chatProvider, chatModel } from "@/lib/brain/llm";
import {
  dimension,
  evidenceRelevance,
  renderCompetitorEvidence,
  renderExistingContent,
  renderIdeaEvidence,
  requestGeneratedTopics,
  similarity,
  TopicProviderError,
  VALID_OPPORTUNITY_TYPES,
  VALID_TYPES,
  type CompetitorEvidence,
  type ExistingCompanyContent,
  type GeneratedTopic,
  type GeneratedTopicBatch,
  type IdeaVaultEvidence,
} from "@/lib/content/topics-generate";

const bodySchema = z.object({
  client_id: z.string().uuid(),
  count:     z.number().int().min(3).max(20).default(8),
  mode: z.enum(["company", "competitor_gap"]).default("company"),
  competitor_ids: z.array(z.string().uuid()).max(10).optional(),
});

export const maxDuration = 180;

// Rate limiting - per client, per window
// 10 requests per 5 minutes per client
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 10;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store (resets on deployment - OK for MVP)
const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = clientId;

  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(key, newEntry);
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: newEntry.resetAt };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count, resetAt: entry.resetAt };
}

// System prompt lives in the prompt registry ("content.topics") — admin-editable.

// Below this fit score, the Brain pre-flags a topic as weak/off-brand so a human
// doesn't waste time on it. Env-tunable.
const FIT_THRESHOLD = Number(process.env.BRAIN_FIT_THRESHOLD ?? 55);


export const POST = withAuth(async (req, { user }) => {
  const rl = await aiGenerateLimiter.check(`topics:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  // Rate limiting check
  const rateLimit = checkRateLimit(parsed.data.client_id);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later.", retryAfter },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(MAX_REQUESTS_PER_WINDOW),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  // Use the shared chat provider (OpenRouter-preferred, OpenAI fallback) so topic
  // generation runs on the same key as distillation/onboarding instead of
  // breaking whenever only OPENROUTER_API_KEY is set.
  const llm = chatProvider();
  if (!llm) {
    return NextResponse.json({ error: "No LLM provider configured (set OPENROUTER_API_KEY or OPENAI_API_KEY)." }, { status: 500 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  // These are service-role reads behind the authenticated tenant boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  let brainContextSnapshotId: string | null = null;
  let structuredBrain: Awaited<ReturnType<typeof resolveNodeBrainContext>> | null = null;
  let brain: {
    text: string;
    hasProfile: boolean;
    hasVault: boolean;
    positives: number;
    negatives: number;
    memories: number;
    positiveExamples: string[];
    negativeExamples: string[];
  };
  {
    try {
      structuredBrain = await resolveNodeBrainContext({
        admin,
        clientId: parsed.data.client_id,
        request: {
          surface: "content",
          contentType: "content_ideas",
          topic: parsed.data.mode === "competitor_gap"
            ? "Competitor-informed content opportunities"
            : "Company content opportunities",
          selectedVaultSourceIds: [],
          includeMarketIntelligence: parsed.data.mode === "competitor_gap",
        },
        model: chatModel("CONTENT_TOPICS_MODEL"),
        promptVersion: "content.topics",
        maxKnowledge: 20,
        maxLibrary: 8,
        maxMemory: 30,
      });
    } catch (error) {
      console.error("[topics/generate] required Brain context failed", error);
      return NextResponse.json({
        error: "The Brain could not prepare verified context. No ideas were generated; please try again.",
        code: "BRAIN_CONTEXT_UNAVAILABLE",
        recoverable: true,
      }, { status: 503 });
    }
    const [positiveResult, negativeResult, negativeSignalResult] = await Promise.all([
      db.from("content_topics")
        .select("title,description")
        .eq("client_id", parsed.data.client_id)
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(8),
      db.from("content_topics")
        .select("title,description,flag_reason")
        .eq("client_id", parsed.data.client_id)
        .or("status.eq.rejected,flagged.eq.true")
        .order("updated_at", { ascending: false })
        .limit(8),
      db.from("brain_signals")
        .select("artifact_text,reason")
        .eq("client_id", parsed.data.client_id)
        .eq("surface", "content_topic")
        .eq("rating", -1)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    if (positiveResult.error || negativeResult.error || negativeSignalResult.error) {
      console.error(
        "[topics/generate] idea history unavailable",
        positiveResult.error ?? negativeResult.error ?? negativeSignalResult.error,
      );
      return NextResponse.json({
        error: "The idea history needed for company fit is temporarily unavailable.",
        code: "BRAIN_IDEA_HISTORY_UNAVAILABLE",
      }, { status: 503 });
    }
    const positiveRows = positiveResult.data;
    const negativeRows = negativeResult.data;
    const negativeSignalRows = negativeSignalResult.data;
    const positiveExamples = (positiveRows ?? []).map(
      (row: { title: string; description?: string | null }) =>
        `${row.title}${row.description ? ` — ${row.description}` : ""}`,
    );
    const negativeExamples = [
      ...(negativeRows ?? []).map(
        (row: { title: string; description?: string | null; flag_reason?: string | null }) =>
          `${row.title}${row.description ? ` — ${row.description}` : ""}${
            row.flag_reason ? ` (reason: ${row.flag_reason})` : ""
          }`,
      ),
      ...(negativeSignalRows ?? []).map(
        (row: { artifact_text: string; reason?: string | null }) =>
          `${row.artifact_text}${row.reason ? ` (reason: ${row.reason})` : ""}`,
      ),
    ];
    brain = {
      text: structuredBrain.prompt,
      hasProfile: Object.keys(structuredBrain.context.company.fields).length > 0,
      hasVault: structuredBrain.context.knowledge.sources.length > 0,
      positives: positiveExamples.length,
      negatives: negativeExamples.length,
      memories: structuredBrain.context.memories.length,
      positiveExamples,
      negativeExamples,
    };
    try {
      const snapshot = await persistNodeBrainContextSnapshot({
        admin,
        context: structuredBrain.context,
        artifactKind: "content_topic",
        createdBy: user.id,
      });
      brainContextSnapshotId = snapshot.id;
    } catch (error) {
      console.error("[topics/generate] Brain context snapshot failed", error);
      return NextResponse.json({
        error: "The Brain context could not be captured safely. No ideas were generated.",
        code: "BRAIN_SNAPSHOT_REQUIRED",
        recoverable: true,
      }, { status: 503 });
    }
  }

  if (!brain.hasProfile && !brain.hasVault) {
    return NextResponse.json(
      { error: "No Company Brain profile or Vault content found. Fill in the Company Brain or add documents to the Vault first." },
      { status: 422 }
    );
  }

  const [
    { data: vaultRows, error: vaultError },
    { data: companyContentRows, error: companyContentError },
  ] = await Promise.all([
    db
      .from("vault_items")
      .select("id,title,ai_summary,raw_content")
      .eq("client_id", parsed.data.client_id)
      .eq("status", "ready")
      .eq("evidence_role", "factual")
      .eq("knowledge_status", "active")
      .eq("has_conflict", false)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${today}`)
      .order("updated_at", { ascending: false })
      .limit(30),
    db
      .from("content_pieces")
      .select("id,title,content_type,body")
      .eq("client_id", parsed.data.client_id)
      .in("status", ["approved", "archived"])
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  if (vaultError || companyContentError) {
    return NextResponse.json({
      error: "The evidence needed to explain content ideas is temporarily unavailable.",
    }, { status: 503 });
  }
  const ideaVaultEvidence = (vaultRows ?? []) as IdeaVaultEvidence[];
  const existingCompanyContent = (companyContentRows ?? []) as ExistingCompanyContent[];

  let competitorEvidence: CompetitorEvidence[] = [];
  let includedCompetitors: Array<{ id: string; name: string }> = [];
  let readiness: unknown[] = [];
  if (parsed.data.mode === "competitor_gap") {
    // These tables are intentionally service-role only at this boundary. Every
    // query remains explicitly tenant-qualified before any content reaches the model.
    const [
      { data: competitorRows, error: competitorError },
      { data: readinessRows, error: readinessError },
    ] = await Promise.all([
      db
        .from("competitors")
        .select("id, name")
        .eq("client_id", parsed.data.client_id)
        .eq("status", "active"),
      db.rpc("competitor_intelligence_readiness", {
        p_client_id: parsed.data.client_id,
      }),
    ]);
    if (competitorError || readinessError) {
      console.error("[topics/generate] competitor context error", competitorError ?? readinessError);
      return NextResponse.json({ error: "Couldn't load competitor intelligence." }, { status: 500 });
    }
    readiness = readinessRows ?? [];
    const requested = parsed.data.competitor_ids?.length
      ? new Set(parsed.data.competitor_ids)
      : null;
    const typedReadinessRows = (readinessRows ?? []) as Array<{
      competitor_id: string;
      ready: boolean;
      [key: string]: unknown;
    }>;
    const readinessById = new Map<string, { competitor_id: string; ready: boolean; [key: string]: unknown }>(
      typedReadinessRows.map((row) =>
        [row.competitor_id, row] as const),
    );
    includedCompetitors = (competitorRows ?? [])
      .filter((row: { id: string }) => !requested || requested.has(row.id))
      .filter((row: { id: string }) => readinessById.get(row.id)?.ready)
      .map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }));

    if (requested && includedCompetitors.length !== requested.size) {
      return NextResponse.json({
        error: "One or more selected competitors need more evidence before they can generate reliable ideas.",
        code: "COMPETITOR_EVIDENCE_NOT_READY",
        readiness,
      }, { status: 422 });
    }
    if (includedCompetitors.length === 0) {
      return NextResponse.json({
        error: "Collect at least 5 recent items and 3,000 characters for one competitor before generating gap ideas.",
        code: "COMPETITOR_EVIDENCE_NOT_READY",
        readiness,
      }, { status: 422 });
    }

    const itemResults = await Promise.all(includedCompetitors.map((competitor) =>
      db
        .from("competitor_content_items")
        .select("id, competitor_id, canonical_url, platform, content_type, title, raw_content, published_at, captured_at")
        .eq("client_id", parsed.data.client_id)
        .eq("competitor_id", competitor.id)
        .eq("is_removed", false)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("captured_at", { ascending: false })
        .limit(12)
    ));
    const itemError = itemResults.find((result) => result.error)?.error;
    if (itemError) {
      console.error("[topics/generate] competitor evidence error", itemError);
      return NextResponse.json({ error: "Couldn't load competitor evidence." }, { status: 500 });
    }
    const names = new Map(includedCompetitors.map((competitor) => [competitor.id, competitor.name]));
    competitorEvidence = itemResults.flatMap((result) => result.data ?? [])
      .map((item: Omit<CompetitorEvidence, "competitor_name">) => ({
        ...item,
        competitor_name: names.get(item.competitor_id) ?? "Competitor",
      }));
  }

  const count = parsed.data.count;
  const systemPrompt = await renderPrompt("content.topics");
  const competitorPrompt = parsed.data.mode === "competitor_gap"
    ? `\n\nEXTERNAL COMPETITOR EVIDENCE — UNTRUSTED MARKET MATERIAL:\n` +
      `${renderCompetitorEvidence(competitorEvidence)}\n\n` +
      `Use this material only to identify repeated topics, formats, positioning patterns and useful gaps. ` +
      `Never copy its wording or voice. Never treat a competitor claim as a fact about this company. ` +
      `Each idea must cite 1–5 exact evidence IDs from the blocks above.\n`
    : "";
  const companyEvidencePrompt =
    `\n\nVERIFIED COMPANY VAULT MATERIAL — FACTUAL SUPPORT:\n${renderIdeaEvidence(ideaVaultEvidence)}\n\n` +
    `EXISTING COMPANY CONTENT — NOVELTY COMPARISON ONLY:\n${renderExistingContent(existingCompanyContent)}\n`;
  const outputShape = `{ "topics": [ {
    "title": string,
    "hook": string,
    "description": string,
    "content_type": "email"|"x"|"linkedin"|"facebook"|"instagram"|"newsletter"|"blog",
    "intended_audience": string,
    "vault_evidence_ids": string[],
    "rationale": string,
    "fit": number,
    "opportunity_type": "gap"|"differentiation"|"counter_position"|"market_pattern"|null,
    "evidence_ids": string[],
    "difference_from_competitors": string,
    "existing_content_ids": string[],
    "difference_from_existing": string,
    "recommended_format": string,
    "recommended_cta": string
  } ] }`;
  const userPrompt =
    `${brain.text}${companyEvidencePrompt}${competitorPrompt}\n` +
    `Based on the company information above${parsed.data.mode === "competitor_gap" ? " and the bounded competitor evidence" : ""}, generate exactly ${count} content topic ideas.\n\n` +
    `RULES (follow strictly):\n` +
    `- Honour the company's goals, audience, brand voice and internal rules.\n` +
    `- Do NOT repeat, paraphrase, or resemble anything listed under "WHAT TO AVOID".\n` +
    `- Favour the angles/style listed under "WHAT WORKS HERE".\n` +
    `- For EACH topic, include "fit": an integer 0-100 for how well it fits THIS specific company (not generic), where below ${FIT_THRESHOLD} means weak, generic, or off-brand.\n\n` +
    `- Cite only supplied Vault, competitor and existing-company-content IDs. Do not invent IDs.\n` +
    `- Explain why the idea differs from existing company content. For competitor mode, also explain how it differs from competitor coverage.\n` +
    `- Recommend one channel-specific format and one specific CTA.\n\n` +
    `- recommended_format must be a format within content_type and must never name a different channel. For example, an email is not a newsletter.\n\n` +
    `- Be concise: keep each explanation to one or two short sentences. Do not repeat the same rationale across fields.\n\n` +
    `Return JSON exactly as: ${outputShape}`;

  const allowedEvidenceIds = new Set(competitorEvidence.map((item) => item.id));
  const evidenceById = new Map(competitorEvidence.map((item) => [item.id, item]));
  const allowedVaultIds = new Set(ideaVaultEvidence.map((item) => item.id));
  const vaultById = new Map(ideaVaultEvidence.map((item) => [item.id, item]));
  const allowedCompanyContentIds = new Set(existingCompanyContent.map((item) => item.id));
  const companyContentById = new Map(existingCompanyContent.map((item) => [item.id, item]));
  const usableTopics = (result: GeneratedTopicBatch): GeneratedTopic[] =>
    result.topics.filter((topic) => {
      const vaultValid = topic.vault_evidence_ids.every((id) => allowedVaultIds.has(id));
      const existingValid = topic.existing_content_ids.every((id) =>
        allowedCompanyContentIds.has(id));
      const competitorValid = topic.evidence_ids.every((id) => allowedEvidenceIds.has(id));
      return (
        vaultValid &&
        existingValid &&
        competitorValid &&
        (
          parsed.data.mode !== "competitor_gap" ||
          (
            topic.evidence_ids.length > 0 &&
            topic.opportunity_type !== null &&
            topic.difference_from_competitors.trim().length > 0
          )
        )
      );
    });

  const providerErrorResponse = (error: unknown) => {
    const failure = error instanceof TopicProviderError
      ? error
      : new TopicProviderError(
        "CONTENT_AI_NETWORK",
        "The content AI service could not be reached. Please try again.",
        502,
      );
    return NextResponse.json({
      error: failure.clientMessage,
      code: failure.code,
    }, { status: failure.httpStatus });
  };

  let firstBatch: GeneratedTopicBatch;
  try {
    firstBatch = await requestGeneratedTopics({
      llm,
      systemPrompt,
      userPrompt,
      count,
    });
  } catch (err) {
    console.error("[topics/generate] initial generation failed", {
      provider: llm.provider,
      code: err instanceof TopicProviderError ? err.code : "CONTENT_AI_NETWORK",
    });
    return providerErrorResponse(err);
  }

  let rawTopics = usableTopics(firstBatch);
  let rejectedIdeas = firstBatch.rejected + (firstBatch.topics.length - rawTopics.length);
  let repairFailed = false;

  if (rawTopics.length < count) {
    const missing = count - rawTopics.length;
    try {
      const repairBatch = await requestGeneratedTopics({
        llm,
        systemPrompt,
        count: missing,
        userPrompt:
          `${userPrompt}\n\nREPAIR REQUIRED: ignore the earlier requested count and return exactly ${missing} additional complete topics. ` +
          `Do not repeat these accepted titles: ${rawTopics.map((topic) => JSON.stringify(topic.title)).join(", ") || "none"}. ` +
          `Cite only supplied IDs whose text directly overlaps the idea. ` +
          `Keep every title at 300 characters or fewer and every description at 2,000 characters or fewer.`,
      });
      const repairedTopics = usableTopics(repairBatch);
      rejectedIdeas += repairBatch.rejected + (repairBatch.topics.length - repairedTopics.length);
      const seenTitles = new Set(rawTopics.map((topic) => topic.title.trim().toLocaleLowerCase()));
      for (const topic of repairedTopics) {
        const key = topic.title.trim().toLocaleLowerCase();
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        rawTopics.push(topic);
        if (rawTopics.length === count) break;
      }
    } catch (err) {
      repairFailed = true;
      console.error("[topics/generate] repair generation failed", {
        provider: llm.provider,
        code: err instanceof TopicProviderError ? err.code : "CONTENT_AI_NETWORK",
      });
      if (rawTopics.length === 0) return providerErrorResponse(err);
    }
  }

  rawTopics = rawTopics.slice(0, count);
  if (rawTopics.length === 0) {
    return NextResponse.json({
      error: "The idea generator did not return any complete, saveable ideas. Please try again.",
      code: "INVALID_IDEA_SET",
    }, { status: 502 });
  }

  // Normalise + capture the model's self-assessed fit.
  const base = rawTopics
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
      if (!title) return null;
      const type = typeof o.content_type === "string" && VALID_TYPES.has(o.content_type) ? o.content_type : "blog";
      const fitNum = Number(o.fit);
      const llmFit = Number.isFinite(fitNum) ? Math.max(0, Math.min(100, Math.round(fitNum))) : null;
      const evidenceIds = Array.isArray(o.evidence_ids)
        ? [...new Set(o.evidence_ids.filter((id): id is string =>
            typeof id === "string" && allowedEvidenceIds.has(id)))]
          .slice(0, 5)
        : [];
      const vaultEvidenceIds = Array.isArray(o.vault_evidence_ids)
        ? [...new Set(o.vault_evidence_ids.filter((id): id is string =>
            typeof id === "string" && allowedVaultIds.has(id)))]
          .slice(0, 8)
        : [];
      const existingContentIds = Array.isArray(o.existing_content_ids)
        ? [...new Set(o.existing_content_ids.filter((id): id is string =>
            typeof id === "string" && allowedCompanyContentIds.has(id)))]
          .slice(0, 8)
        : [];
      if (parsed.data.mode === "competitor_gap" && evidenceIds.length === 0) return null;
      const opportunityType = typeof o.opportunity_type === "string"
        && VALID_OPPORTUNITY_TYPES.has(o.opportunity_type)
        ? o.opportunity_type
        : null;
      return {
        title,
        description: typeof o.description === "string" ? o.description.trim().slice(0, 2000) : "",
        content_type: type,
        rationale: typeof o.rationale === "string" ? o.rationale : "",
        llmFit,
        opportunityType,
        evidenceSummary: typeof o.evidence_summary === "string"
          ? o.evidence_summary.trim().slice(0, 1000)
          : "",
        evidenceIds,
        vaultEvidenceIds,
        existingContentIds,
        hook: typeof o.hook === "string" ? o.hook.trim().slice(0, 500) : title,
        topic: typeof o.topic === "string" ? o.topic.trim().slice(0, 300) : title,
        intendedAudience: typeof o.intended_audience === "string" ? o.intended_audience.trim().slice(0, 1000) : "",
        strategicObjective: typeof o.strategic_objective === "string" ? o.strategic_objective.trim().slice(0, 1200) : "",
        whyValuable: typeof o.why_valuable === "string" ? o.why_valuable.trim().slice(0, 1600) : "",
        companyDnaFit: typeof o.company_dna_fit === "string" ? o.company_dna_fit.trim().slice(0, 1600) : "",
        differenceFromCompetitors: typeof o.difference_from_competitors === "string" ? o.difference_from_competitors.trim().slice(0, 1600) : "",
        differenceFromExisting: typeof o.difference_from_existing === "string" ? o.difference_from_existing.trim().slice(0, 1600) : "",
        recommendedFormat: typeof o.recommended_format === "string" ? o.recommended_format.trim().slice(0, 500) : "",
        recommendedCta: typeof o.recommended_cta === "string" ? o.recommended_cta.trim().slice(0, 800) : "",
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Verify topic/source relationships semantically in one bounded embedding
  // request. Lexical overlap remains only as an explicitly disclosed fallback
  // when the embedding provider is unavailable; it can never produce a
  // high-confidence recommendation.
  const semanticQueries = base.flatMap((topic, index) => {
    const idea = [
      topic.title,
      topic.topic,
      topic.description,
      topic.whyValuable,
      topic.companyDnaFit,
    ].join(" ");
    return [
      { key: `idea:${index}`, text: idea },
      { key: `existing-claim:${index}`, text: topic.differenceFromExisting },
      { key: `competitor-claim:${index}`, text: topic.differenceFromCompetitors },
      { key: `evidence-summary:${index}`, text: topic.evidenceSummary },
    ];
  });
  const semanticDocuments = [
    ...ideaVaultEvidence.map((item) => ({
      key: `vault:${item.id}`,
      text: `${item.title} ${item.ai_summary ?? ""} ${item.raw_content?.slice(0, 2500) ?? ""}`,
    })),
    ...existingCompanyContent.map((item) => ({
      key: `existing:${item.id}`,
      text: `${item.title} ${item.body?.slice(0, 2500) ?? ""}`,
    })),
    ...competitorEvidence.map((item) => ({
      key: `competitor:${item.id}`,
      text: `${item.title} ${item.raw_content.slice(0, 2500)}`,
    })),
  ];
  let semanticVectors: Map<string, number[]> | null = null;
  try {
    const entries = [...semanticQueries, ...semanticDocuments];
    const vectors = await embedTexts(entries.map((entry) => entry.text));
    if (vectors?.length === entries.length) {
      semanticVectors = new Map(entries.map((entry, index) => [entry.key, vectors[index]]));
    }
  } catch (error) {
    console.error("[topics/generate] semantic evidence verification failed", error);
  }
  const semanticScore = (queryKey: string, documentKey: string): number | null => {
    const query = semanticVectors?.get(queryKey);
    const document = semanticVectors?.get(documentKey);
    return query && document ? cosine(query, document) : null;
  };
  const verifiedRelevance = (
    topicIndex: number,
    kind: "vault" | "existing" | "competitor",
    id: string,
    fallbackIdea: string,
    fallbackEvidence: string,
  ): boolean => {
    const score = semanticScore(`idea:${topicIndex}`, `${kind}:${id}`);
    return score === null
      ? evidenceRelevance(fallbackIdea, fallbackEvidence) >= 0.12
      : score >= 0.32;
  };
  const verifiedComparisonClaim = (
    topicIndex: number,
    kind: "existing" | "competitor",
    claim: string,
    ids: string[],
  ): boolean => {
    if (claim.trim().length < 40 || ids.length === 0) return false;
    const claimKey = kind === "existing"
      ? `existing-claim:${topicIndex}`
      : `competitor-claim:${topicIndex}`;
    const ideaScore = semanticScore(claimKey, `idea:${topicIndex}`);
    if (semanticVectors) {
      return (ideaScore ?? 0) >= 0.25 && ids.some((id) =>
        (semanticScore(claimKey, `${kind}:${id}`) ?? 0) >= 0.28);
    }
    // Fallback is conservative and is surfaced as such. It checks the complete
    // claim against a cited comparison, rather than rewarding prose length.
    return ids.some((id) => {
      const document = kind === "existing"
        ? companyContentById.get(id)
        : evidenceById.get(id);
      const text = document
        ? "body" in document
          ? `${document.title} ${document.body ?? ""}`
          : `${document.title} ${document.raw_content}`
        : "";
      return evidenceRelevance(claim, text) >= 0.2;
    });
  };

  // Ground the score in the client's real acceptance history (embedding fit),
  // then blend with the model's self-assessment. Falls back to self-fit alone
  // when there isn't enough approved/rejected history yet.
  let embFits: (number | null)[] | null = null;
  try {
    embFits = await embeddingFit({
      positives: brain.positiveExamples,
      negatives: brain.negativeExamples,
      candidates: base.map((t) => `${t.title} — ${t.description}`),
    });
  } catch (e) {
    console.error("[topics/generate] embeddingFit failed", e);
  }

  // Shared provenance — what the Brain drew on to produce these ("Why this?").
  const whyBase = {
    profile: brain.hasProfile,
    vault: brain.hasVault,
    lessons: brain.memories,
    examples: brain.positives,
    grounded: embFits !== null,
  };

  let topics = base.map((t, i) => {
    const emb = embFits?.[i] ?? null;
    const fit =
      t.llmFit !== null && emb !== null ? Math.round(t.llmFit * 0.5 + emb * 0.5)
      : emb !== null ? emb
      : t.llmFit;
    const ideaText = [
      t.title,
      t.topic,
      t.description,
      t.whyValuable,
      t.companyDnaFit,
    ].join(" ");
    const relevantExistingContentIds = t.existingContentIds.filter((id) => {
      const existing = companyContentById.get(id)!;
      return verifiedRelevance(
        i,
        "existing",
        id,
        ideaText,
        `${existing.title} ${existing.body?.slice(0, 2500) ?? ""}`,
      );
    });
    const maxExistingSimilarity = existingCompanyContent.reduce((maximum, existing) =>
      Math.max(maximum, similarity(
        `${t.title} ${t.description}`,
        `${existing.title} ${existing.body?.slice(0, 1000) ?? ""}`,
      )), 0);
    const relevantVaultIds = t.vaultEvidenceIds.filter((id) => {
      const evidence = vaultById.get(id)!;
      return verifiedRelevance(
        i,
        "vault",
        id,
        ideaText,
        `${evidence.title} ${evidence.ai_summary ?? ""} ${evidence.raw_content?.slice(0, 2500) ?? ""}`,
      );
    });
    const relevantMarketIds = t.evidenceIds.filter((id) => {
      const evidence = evidenceById.get(id)!;
      return verifiedRelevance(
        i,
        "competitor",
        id,
        ideaText,
        `${evidence.title} ${evidence.raw_content.slice(0, 2500)}`,
      );
    });
    const existingComparisonVerified = verifiedComparisonClaim(
      i,
      "existing",
      t.differenceFromExisting,
      relevantExistingContentIds,
    );
    const competitorComparisonVerified = parsed.data.mode === "competitor_gap"
      && verifiedComparisonClaim(
        i,
        "competitor",
        t.differenceFromCompetitors,
        relevantMarketIds,
      );
    const evidenceSummaryVerified = t.evidenceSummary.trim().length >= 20 && (
      relevantVaultIds.some((id) =>
        (semanticScore(`evidence-summary:${i}`, `vault:${id}`) ?? 0) >= 0.28) ||
      relevantMarketIds.some((id) =>
        (semanticScore(`evidence-summary:${i}`, `competitor:${id}`) ?? 0) >= 0.28)
    );
    const vaultStrength = relevantVaultIds.length >= 3
      ? 90
      : relevantVaultIds.length === 2
        ? 78
        : relevantVaultIds.length === 1
          ? 58
          : 20;
    const marketStrength = parsed.data.mode === "competitor_gap"
      ? Math.min(95, 30 + relevantMarketIds.length * 18)
      : 50;
    const differentiationStrength = Math.min(
      95,
      25 +
      (existingComparisonVerified ? 30 : 0) +
      (relevantExistingContentIds.length ? 15 : 0) +
      (competitorComparisonVerified ? 25 : 0),
    );
    const channelFit = [
      t.intendedAudience,
      t.strategicObjective,
      t.recommendedFormat,
      t.recommendedCta,
    ].filter((value) => value.length >= 3).length * 22;
    const confidenceScore = (
      (fit ?? 45) +
      vaultStrength +
      marketStrength +
      differentiationStrength +
      Math.round((1 - maxExistingSimilarity) * 100) +
      Math.min(100, channelFit)
    ) / 6;
    const evidenceStrength = relevantVaultIds.length >= 2
      ? "high"
      : relevantVaultIds.length === 1
        ? "medium"
        : "low";
    const confidence = semanticVectors && confidenceScore >= 76 && evidenceStrength !== "low"
      ? "high"
      : confidenceScore >= 55
        ? "medium"
        : "low";
    const supportingMarketSignals = relevantMarketIds.map((id) => {
      const evidence = evidenceById.get(id)!;
      return {
        itemId: evidence.id,
        competitorName: evidence.competitor_name,
        title: evidence.title,
        url: evidence.canonical_url,
      };
    });
    return {
      title: t.title,
      description: t.description,
      content_type: t.content_type,
      rationale: t.rationale,
      fit,
      ai_flagged: fit !== null && fit < FIT_THRESHOLD,
      why: { ...whyBase, fit },
      explainability: {
        hook: t.hook,
        topic: t.topic,
        intendedAudience: t.intendedAudience || "Audience requires editor confirmation.",
        strategicObjective: t.strategicObjective || "Objective requires editor confirmation.",
        whyValuable: t.whyValuable || t.rationale,
        companyDnaFit: t.companyDnaFit || "Aligned using the available Company Brain context.",
        supportingVaultMaterial: relevantVaultIds.map((id) => ({
          itemId: id,
          title: vaultById.get(id)!.title,
        })),
        supportingMarketSignals,
        differenceFromCompetitors: parsed.data.mode !== "competitor_gap"
          ? "No competitor comparison was requested."
          : competitorComparisonVerified
            ? t.differenceFromCompetitors
            : "The proposed competitor differentiation was not independently verified; editor review is required.",
        existingCompanyContent: relevantExistingContentIds.map((id) => {
          const existing = companyContentById.get(id)!;
          return { id, title: existing.title, contentType: existing.content_type };
        }),
        differenceFromExisting: existingComparisonVerified
          ? t.differenceFromExisting
          : `No source-grounded comparison claim was verified. The closest lexical overlap across ${existingCompanyContent.length} existing company artifact${existingCompanyContent.length === 1 ? "" : "s"} was ${Math.round(maxExistingSimilarity * 100)}%.`,
        recommendedFormat: t.recommendedFormat || `${t.content_type} post`,
        recommendedCta: t.recommendedCta || "Invite the audience to take one relevant next step.",
        confidence,
        evidenceStrength,
        evidenceVerification: {
          method: semanticVectors ? "semantic_embeddings" : "sentence_overlap_fallback",
          highConfidenceEligible: semanticVectors !== null,
          verifiedVaultIds: relevantVaultIds,
          verifiedCompetitorIds: relevantMarketIds,
          verifiedExistingContentIds: relevantExistingContentIds,
          existingComparisonVerified,
          competitorComparisonVerified,
          evidenceSummaryVerified: semanticVectors ? evidenceSummaryVerified : false,
        },
        scores: {
          companyRelevance: dimension(fit ?? 40, fit === null
            ? "Insufficient acceptance history; editor confirmation is required."
            : "Blends Company Brain fit with the client’s approved and rejected idea history."),
          audienceRelevance: dimension(t.intendedAudience ? Math.min(95, 60 + (fit ?? 40) * 0.3) : 30,
            t.intendedAudience || "The model did not identify a specific audience."),
          vaultEvidenceStrength: dimension(vaultStrength,
            relevantVaultIds.length
              ? `${relevantVaultIds.length} of ${t.vaultEvidenceIds.length} cited factual Vault item${t.vaultEvidenceIds.length === 1 ? "" : "s"} passed ${semanticVectors ? "semantic" : "fallback sentence-level"} relevance verification.`
              : "No factual Vault material directly supports this idea yet."),
          marketOpportunity: dimension(marketStrength,
            parsed.data.mode === "competitor_gap"
              ? `${relevantMarketIds.length} of ${t.evidenceIds.length} cited competitor signal${t.evidenceIds.length === 1 ? "" : "s"} passed ${semanticVectors ? "semantic" : "fallback sentence-level"} relevance verification.`
              : "Company-led idea; no competitor opportunity analysis was requested."),
          differentiation: dimension(differentiationStrength,
            existingComparisonVerified || competitorComparisonVerified
              ? "Only independently verified comparison claims contribute to this score."
              : "No independently verified comparison claim contributes to this score."),
          novelty: dimension((1 - maxExistingSimilarity) * 100,
            `Maximum lexical overlap with ${existingCompanyContent.length} existing company artifact${existingCompanyContent.length === 1 ? "" : "s"} is ${Math.round(maxExistingSimilarity * 100)}%.`),
          channelFit: dimension(channelFit,
            `Audience, objective, ${t.recommendedFormat || "format"} and CTA were assessed for ${t.content_type}.`),
        },
      },
      ...(parsed.data.mode === "competitor_gap" ? {
        opportunity_type: t.opportunityType,
        evidence_summary: semanticVectors && evidenceSummaryVerified
          ? t.evidenceSummary
          : "The generated evidence summary was not independently verified; inspect the linked market signals.",
        competitor_evidence: relevantMarketIds.map((id) => {
          const evidence = evidenceById.get(id)!;
          return {
            item_id: evidence.id,
            competitor_id: evidence.competitor_id,
            competitor_name: evidence.competitor_name,
            title: evidence.title,
            url: evidence.canonical_url,
          };
        }),
        why: {
          ...whyBase,
          fit,
          competitor_evidence: relevantMarketIds.length,
          competitors: [...new Set(relevantMarketIds.map((id) =>
            evidenceById.get(id)!.competitor_name))],
          competitor_sources: relevantMarketIds.map((id) => {
            const evidence = evidenceById.get(id)!;
            return {
              item_id: evidence.id,
              competitor_id: evidence.competitor_id,
              competitor_name: evidence.competitor_name,
              title: evidence.title,
              url: evidence.canonical_url,
            };
          }),
          opportunity_type: t.opportunityType,
          evidence_summary: semanticVectors && evidenceSummaryVerified
            ? t.evidenceSummary
            : "The generated evidence summary was not independently verified.",
        },
      } : {}),
    };
  });

  if (parsed.data.mode === "competitor_gap") {
    topics = topics.filter((topic) =>
      "competitor_evidence" in topic && Boolean(topic.competitor_evidence?.length));
  }

  if (topics.length === 0) {
    return NextResponse.json({
      error: parsed.data.mode === "competitor_gap"
        ? "No ideas had enough verified competitor evidence. Collect more competitor content or try another competitor."
        : "The idea generator did not return any complete, saveable ideas. Please try again.",
      code: "INCOMPLETE_VERIFIED_IDEA_SET",
    }, { status: 422 });
  }

  // Journal: surface the value the Brain just delivered (weak ideas filtered).
  const flaggedCount = topics.filter((t) => t.ai_flagged).length;
  if (flaggedCount > 0) {
    await logBrainEvent(admin, parsed.data.client_id, "filtered",
      `Pre-screened ${topics.length} ideas and flagged ${flaggedCount} as weak before you saw them`,
      { total: topics.length, flagged: flaggedCount },
      { meaningful: true, eventKey: `filtered:${new Date().toISOString().slice(0, 10)}` });
  }

  return NextResponse.json({
    topics: topics.map((topic) => ({
      ...topic,
      brain_context_snapshot_id: brainContextSnapshotId,
    })),
    mode: parsed.data.mode,
    competitors: includedCompetitors,
    readiness: parsed.data.mode === "competitor_gap" ? readiness : undefined,
    warning: [
      topics.length < count
        ? `Generated ${topics.length} of ${count} requested ideas. ${
        parsed.data.mode === "competitor_gap"
          ? "Ideas without verified competitor evidence were left out."
          : "Incomplete model responses were left out."
      }${repairFailed ? " The repair attempt was unavailable." : ""}${
        rejectedIdeas > 0 ? ` ${rejectedIdeas} incomplete idea${rejectedIdeas === 1 ? " was" : "s were"} excluded.` : ""
      }`
        : null,
    ].filter(Boolean).join(" ") || undefined,
    learnedFrom: { positives: brain.positives, negatives: brain.negatives, grounded: embFits !== null },
    brainContextSnapshotId,
  });
});
