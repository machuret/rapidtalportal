import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldKeys } from "@/lib/brain/profile-fields";

type Admin = SupabaseClient;

export type BrainReadinessStatus = "strong" | "developing" | "limited" | "not_ready";
export type BrainReadinessDimensionKey =
  | "knowledge"
  | "voice"
  | "personalisation"
  | "reliability"
  | "market";

export interface BrainReadinessDimension {
  key: BrainReadinessDimensionKey;
  label: string;
  score: number;
  status: BrainReadinessStatus;
  summary: string;
  evidence: string[];
  actions: string[];
}

export interface ContextualBrainReadiness {
  channel: string | null;
  channelReadiness: BrainReadinessStatus;
  voiceConfidence: "high" | "medium" | "low" | "not_configured";
  vaultCoverage: "strong" | "partial" | "weak" | "none";
  relevantLessons: number;
  marketUpdatedAt: string | null;
}

export interface BrainReadiness {
  label: "Brain Readiness";
  overallStatus: BrainReadinessStatus;
  dimensions: BrainReadinessDimension[];
  contextual: ContextualBrainReadiness;
  measuredAt: string;
}

const PROFILE_FIELDS = fieldKeys("completeness");
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const ratio = (value: number, total: number) => total > 0 ? value / total : 0;

export function readinessStatus(score: number): BrainReadinessStatus {
  if (score >= 80) return "strong";
  if (score >= 55) return "developing";
  if (score >= 25) return "limited";
  return "not_ready";
}

function dimension(
  key: BrainReadinessDimensionKey,
  label: string,
  score: number,
  summary: string,
  evidence: string[],
  actions: string[],
): BrainReadinessDimension {
  const safeScore = clamp(score);
  return { key, label, score: safeScore, status: readinessStatus(safeScore), summary, evidence, actions };
}

function styleConfidence(analysis: unknown): number | null {
  if (!analysis || typeof analysis !== "object") return null;
  const value = (analysis as Record<string, unknown>).confidence;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 1 ? Math.round(value * 100) : clamp(value);
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "high") return 85;
    if (value.toLowerCase() === "medium") return 60;
    if (value.toLowerCase() === "low") return 30;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed <= 1 ? Math.round(parsed * 100) : clamp(parsed);
  }
  return null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function computeBrainReadiness(
  admin: Admin,
  clientId: string,
  options: { channel?: string | null } = {},
): Promise<BrainReadiness> {
  const db = admin as never as {
    from: (table: string) => ReturnType<Admin["from"]>;
  };
  const now = new Date();
  const recent = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const staleProcessing = new Date(now.getTime() - 20 * 60_000).toISOString();

  const [
    dnaResult,
    vaultResult,
    gapsResult,
    stylesResult,
    memoriesResult,
    lineageResult,
    attemptsResult,
    contextsResult,
    queriesResult,
    competitorsResult,
    capturesResult,
    intelligenceResult,
    evaluationsResult,
  ] = await Promise.all([
    admin.from("company_dna").select("*").eq("client_id", clientId).maybeSingle(),
    admin.from("vault_items")
      .select("id,status,indexed_at,evidence_role,knowledge_status,has_conflict,updated_at,created_at")
      .eq("client_id", clientId).limit(5000),
    db.from("brain_knowledge_gaps")
      .select("id,status,importance,occurrence_count")
      .eq("client_id", clientId).in("status", ["open", "in_review"]).limit(1000),
    admin.from("content_style_analyses")
      .select("id,channel,status,analysis,source_count,approved_at")
      .eq("client_id", clientId).eq("status", "approved").limit(50),
    admin.from("brain_memory")
      .select("id,kind,scope,source_count,lineage_complete,contradiction_status,status,active")
      .eq("client_id", clientId).eq("status", "active").eq("active", true).limit(500),
    db.from("brain_memory_sources")
      .select("id,memory_id,signal_id,brain_signals(dimensions)")
      .eq("client_id", clientId).eq("contribution", "support").limit(5000),
    admin.from("content_analysis_attempts")
      .select("status,analysis_kind,lease_until,created_at")
      .eq("client_id", clientId).gte("created_at", recent).limit(5000),
    admin.from("brain_context_snapshots")
      .select("id,surface,created_at")
      .eq("client_id", clientId).gte("created_at", recent).limit(5000),
    admin.from("vault_queries")
      .select("answered,created_at")
      .eq("client_id", clientId).neq("visibility", "private_coach")
      .gte("created_at", recent).limit(5000),
    admin.from("competitors")
      .select("id,status").eq("client_id", clientId).eq("status", "active").limit(100),
    admin.from("competitor_content_items")
      .select("id,captured_at,is_removed").eq("client_id", clientId)
      .eq("is_removed", false).order("captured_at", { ascending: false }).limit(5000),
    admin.from("competitor_intelligence_runs")
      .select("id,status,created_at,analysis,source_count")
      .eq("client_id", clientId).eq("status", "complete")
      .order("created_at", { ascending: false }).limit(1),
    admin.from("content_voice_evaluations")
      .select("status,automated_evaluation,preferred_variant,assignment,created_at")
      .eq("client_id", clientId).gte("created_at", recent).limit(500),
  ]);

  const failed = [
    dnaResult, vaultResult, gapsResult, stylesResult, memoriesResult, lineageResult,
    attemptsResult, contextsResult, queriesResult, competitorsResult, capturesResult,
    intelligenceResult, evaluationsResult,
  ].find((result) => result.error);
  if (failed?.error) throw new Error(`Brain readiness could not be measured: ${failed.error.message}`);

  const dna = (dnaResult.data ?? null) as Record<string, unknown> | null;
  const profileFilled = dna
    ? PROFILE_FIELDS.filter((field) => typeof dna[field] === "string" && String(dna[field]).trim()).length
    : 0;
  const profilePct = Math.round(ratio(profileFilled, PROFILE_FIELDS.length) * 100);
  const channelStyles = dna?.channel_styles && typeof dna.channel_styles === "object"
    ? dna.channel_styles as Record<string, unknown>
    : {};
  const hasGlobalVoice = Boolean(
    (typeof dna?.brand_voice === "string" && dna.brand_voice.trim())
    || (typeof dna?.content_style === "string" && dna.content_style.trim()),
  );

  type VaultRow = {
    status: string; indexed_at: string | null; evidence_role: string | null;
    knowledge_status: string | null; has_conflict: boolean | null; updated_at: string | null;
  };
  const vault = (vaultResult.data ?? []) as VaultRow[];
  const factual = vault.filter((row) => !row.evidence_role || row.evidence_role === "factual");
  const usable = factual.filter((row) =>
    row.status === "ready"
    && (row.knowledge_status ?? "active") === "active"
    && row.has_conflict !== true
  );
  const searchable = usable.filter((row) => row.indexed_at).length;
  const failedSources = factual.filter((row) => row.status === "error").length;
  const stuckSources = factual.filter((row) =>
    ["pending", "processing"].includes(row.status) && (row.updated_at ?? "") < staleProcessing
  ).length;
  const openGaps = (gapsResult.data ?? []) as Array<{ importance: string; occurrence_count: number }>;
  const importantGaps = openGaps.filter((gap) => ["high", "critical"].includes(gap.importance)).length;
  const knowledgeScore = clamp(
    Math.min(1, usable.length / 12) * 35
    + ratio(searchable, usable.length) * 30
    + profilePct * 0.25
    + Math.max(0, 10 - Math.min(10, openGaps.length * 2))
    - Math.min(20, failedSources * 3 + stuckSources * 3 + importantGaps * 4),
  );
  const knowledge = dimension(
    "knowledge",
    "Knowledge readiness",
    knowledgeScore,
    usable.length
      ? `${usable.length} company sources are usable; ${searchable} are available to retrieval.`
      : "No company sources are currently usable by the Brain.",
    [
      `${profilePct}% Company DNA completion`,
      `${openGaps.length} unresolved knowledge gap${openGaps.length === 1 ? "" : "s"}`,
      `${failedSources + stuckSources} failed or stalled source${failedSources + stuckSources === 1 ? "" : "s"}`,
    ],
    [
      ...(usable.length < 5 ? ["Add more company knowledge to the Vault."] : []),
      ...(searchable < usable.length ? ["Finish retrieval indexing for usable sources."] : []),
      ...(openGaps.length ? ["Review and resolve the highest-impact knowledge gaps."] : []),
    ],
  );

  type StyleRow = { channel: string; analysis: unknown; source_count: number };
  const styles = (stylesResult.data ?? []) as StyleRow[];
  const styleExamples = vault.filter((row) => row.evidence_role === "style_example" && row.status === "ready").length;
  const styleConfidences = styles.map((row) => styleConfidence(row.analysis)).filter((value): value is number => value !== null);
  const averageConfidence = styleConfidences.length
    ? Math.round(styleConfidences.reduce((sum, value) => sum + value, 0) / styleConfidences.length)
    : 0;
  const channelCoverage = new Set([
    ...styles.map((row) => row.channel),
    ...Object.entries(channelStyles).filter(([, value]) => Boolean(value)).map(([channel]) => channel),
  ]).size;
  const voiceScore = clamp(
    (hasGlobalVoice ? 25 : 0)
    + Math.min(30, channelCoverage * 6)
    + Math.min(25, styleExamples * 3)
    + averageConfidence * 0.2,
  );
  const voice = dimension(
    "voice",
    "Voice readiness",
    voiceScore,
    styles.length
      ? `${styles.length} approved channel profile${styles.length === 1 ? "" : "s"} with ${averageConfidence || "unreported"}% average confidence.`
      : hasGlobalVoice
        ? "Global Company DNA voice is available, but no channel analysis is approved."
        : "The Brain is using a generic professional voice.",
    [
      `${channelCoverage} channel${channelCoverage === 1 ? "" : "s"} configured`,
      `${styleExamples} owned style example${styleExamples === 1 ? "" : "s"}`,
      `${styles.reduce((sum, row) => sum + row.source_count, 0)} examples analysed`,
    ],
    [
      ...(!hasGlobalVoice ? ["Add a global voice in Company DNA."] : []),
      ...(styles.length === 0 ? ["Analyse and approve an owned channel style."] : []),
      ...(styleExamples < 3 ? ["Add more representative owned examples."] : []),
    ],
  );

  type MemoryRow = {
    id: string; kind: string; scope: unknown; source_count: number;
    lineage_complete: boolean; contradiction_status: string;
  };
  const memories = (memoriesResult.data ?? []) as MemoryRow[];
  const exactSignals = new Set(
    ((lineageResult.data ?? []) as Array<{ signal_id: string }>).map((row) => row.signal_id),
  ).size;
  const dimensions = new Set<string>();
  for (const row of (lineageResult.data ?? []) as Array<{ brain_signals?: { dimensions?: unknown } | Array<{ dimensions?: unknown }> }>) {
    const signals = Array.isArray(row.brain_signals) ? row.brain_signals : row.brain_signals ? [row.brain_signals] : [];
    for (const signal of signals) for (const item of arrayOfStrings(signal.dimensions)) dimensions.add(item);
  }
  const memoryChannels = new Set<string>();
  for (const memory of memories) {
    if (!memory.scope || typeof memory.scope !== "object") continue;
    for (const channel of arrayOfStrings((memory.scope as Record<string, unknown>).channels)) memoryChannels.add(channel);
  }
  const completeLineage = memories.filter((memory) => memory.lineage_complete && memory.source_count > 0).length;
  const conflicts = memories.filter((memory) => memory.contradiction_status === "open").length;
  const personalisationScore = clamp(
    Math.min(40, memories.length * 5)
    + Math.min(20, dimensions.size * 4)
    + ratio(completeLineage, memories.length) * 20
    + Math.min(20, memoryChannels.size * 5)
    - conflicts * 8,
  );
  const personalisation = dimension(
    "personalisation",
    "Personalisation maturity",
    personalisationScore,
    memories.length
      ? `${memories.length} approved lesson${memories.length === 1 ? "" : "s"} supported by ${exactSignals} exact signal${exactSignals === 1 ? "" : "s"}.`
      : "No approved learning is currently influencing outputs.",
    [
      `${dimensions.size} feedback dimension${dimensions.size === 1 ? "" : "s"} represented`,
      `${memoryChannels.size} channel-specific learning area${memoryChannels.size === 1 ? "" : "s"}`,
      `${conflicts} unresolved contradiction${conflicts === 1 ? "" : "s"}`,
    ],
    [
      ...(memories.length === 0 ? ["Approve useful lessons from the learning inbox."] : []),
      ...(conflicts ? ["Resolve contradictory lessons before expanding their scope."] : []),
    ],
  );

  type AttemptRow = { status: string; lease_until: string; analysis_kind: string };
  const attempts = (attemptsResult.data ?? []) as AttemptRow[];
  const completedAttempts = attempts.filter((row) => ["succeeded", "failed"].includes(row.status));
  const successfulAttempts = completedAttempts.filter((row) => row.status === "succeeded").length;
  const expiredAttempts = attempts.filter((row) => row.status === "running" && row.lease_until < now.toISOString()).length;
  const contextCount = (contextsResult.data ?? []).length;
  const recentQueries = (queriesResult.data ?? []) as Array<{ answered: boolean }>;
  const retrievalSuccess = recentQueries.length
    ? Math.round(ratio(recentQueries.filter((row) => row.answered).length, recentQueries.length) * 100)
    : null;
  const evaluations = (evaluationsResult.data ?? []) as Array<{
    status: string;
    preferred_variant: "a" | "b" | "tie" | null;
    assignment: { a?: "conditioned" | "baseline"; b?: "conditioned" | "baseline" } | null;
  }>;
  const reviewedEvaluations = evaluations.filter((row) => row.status === "reviewed");
  const conditionedPreferred = reviewedEvaluations.filter((row) =>
    row.preferred_variant !== null
    && row.preferred_variant !== "tie"
    && row.assignment?.[row.preferred_variant] === "conditioned"
  ).length;
  const ties = reviewedEvaluations.filter((row) => row.preferred_variant === "tie").length;
  const evaluationRate = reviewedEvaluations.length
    ? Math.round(ratio(conditionedPreferred + ties * 0.5, reviewedEvaluations.length) * 100)
    : null;
  const attemptRate = completedAttempts.length ? ratio(successfulAttempts, completedAttempts.length) * 100 : 50;
  const reliabilityScore = clamp(
    attemptRate * 0.55
    + (retrievalSuccess ?? 50) * 0.25
    + (contextCount > 0 ? 15 : 0)
    + (evaluationRate ?? 50) * 0.05
    - expiredAttempts * 10
    - failedSources * 4,
  );
  const reliability = dimension(
    "reliability",
    "Reliability",
    reliabilityScore,
    completedAttempts.length
      ? `${successfulAttempts}/${completedAttempts.length} recent AI operations completed successfully.`
      : "There is not enough recent runtime history to demonstrate reliability yet.",
    [
      `${contextCount} successful context build${contextCount === 1 ? "" : "s"} in 30 days`,
      retrievalSuccess === null ? "No recent Ask retrieval history" : `${retrievalSuccess}% recent Ask answer availability`,
      evaluationRate === null ? "No reviewed voice evaluations" : `${evaluationRate}% evaluated preference for the styled variant`,
    ],
    [
      ...(expiredAttempts ? ["Recover expired processing attempts."] : []),
      ...(completedAttempts.length < 5 ? ["Run more real workflows to establish a reliable baseline."] : []),
    ],
  );

  const competitors = (competitorsResult.data ?? []).length;
  const captures = (capturesResult.data ?? []) as Array<{ captured_at: string }>;
  const freshCaptures = captures.filter((row) => row.captured_at >= recent).length;
  const latestCapture = captures[0]?.captured_at ?? null;
  const latestIntelligence = (intelligenceResult.data ?? [])[0] as
    | { created_at: string; analysis: unknown; source_count: number }
    | undefined;
  const opportunityCount = latestIntelligence?.analysis && typeof latestIntelligence.analysis === "object"
    ? arrayOfStrings((latestIntelligence.analysis as Record<string, unknown>).opportunities).length
      || (Array.isArray((latestIntelligence.analysis as Record<string, unknown>).opportunities)
        ? ((latestIntelligence.analysis as Record<string, unknown>).opportunities as unknown[]).length
        : 0)
    : 0;
  const marketScore = clamp(
    Math.min(25, competitors * 8)
    + Math.min(25, freshCaptures * 2)
    + (latestIntelligence ? 25 : 0)
    + Math.min(25, opportunityCount * 5),
  );
  const market = dimension(
    "market",
    "Market intelligence readiness",
    marketScore,
    latestIntelligence
      ? `Current intelligence uses ${latestIntelligence.source_count} competitor items.`
      : competitors
        ? "Competitors are configured, but no current intelligence report is available."
        : "No competitor market context is configured.",
    [
      `${competitors} active competitor${competitors === 1 ? "" : "s"}`,
      `${freshCaptures} fresh capture${freshCaptures === 1 ? "" : "s"} in 30 days`,
      `${opportunityCount} supported opportunit${opportunityCount === 1 ? "y" : "ies"}`,
    ],
    [
      ...(competitors === 0 ? ["Add the most relevant competitors and source URLs."] : []),
      ...(competitors > 0 && !latestIntelligence ? ["Run competitor analysis."] : []),
      ...(latestIntelligence && freshCaptures === 0 ? ["Refresh competitor sources before the next analysis."] : []),
    ],
  );

  const dimensionsList = [knowledge, voice, personalisation, reliability, market];
  const average = dimensionsList.reduce((sum, item) => sum + item.score, 0) / dimensionsList.length;
  const selectedChannel = options.channel?.toLowerCase() || null;
  const channelAnalysis = selectedChannel
    ? styles.find((style) => style.channel === selectedChannel)
    : undefined;
  const channelConfidence = channelAnalysis ? styleConfidence(channelAnalysis.analysis) : null;
  const relevantLessons = selectedChannel
    ? memories.filter((memory) => {
        if (!memory.scope || typeof memory.scope !== "object") return true;
        const scope = memory.scope as Record<string, unknown>;
        const channels = arrayOfStrings(scope.channels);
        return scope.global === true || channels.length === 0 || channels.includes(selectedChannel);
      }).length
    : memories.length;

  return {
    label: "Brain Readiness",
    overallStatus: readinessStatus(average),
    dimensions: dimensionsList,
    contextual: {
      channel: selectedChannel,
      channelReadiness: readinessStatus(
        selectedChannel
          ? voice.score * 0.45 + knowledge.score * 0.3 + reliability.score * 0.15 + personalisation.score * 0.1
          : average,
      ),
      voiceConfidence: channelConfidence === null
        ? (hasGlobalVoice ? "low" : "not_configured")
        : channelConfidence >= 75 ? "high" : channelConfidence >= 50 ? "medium" : "low",
      vaultCoverage: searchable >= 8 ? "strong" : searchable >= 3 ? "partial" : searchable > 0 ? "weak" : "none",
      relevantLessons,
      marketUpdatedAt: latestIntelligence?.created_at ?? latestCapture,
    },
    measuredAt: now.toISOString(),
  };
}
