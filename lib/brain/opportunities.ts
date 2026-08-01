import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/database";
import {
  persistNodeBrainContextSnapshot,
  resolveNodeBrainContext,
} from "@/lib/brain/resolver";
import {
  computeBrainReadiness,
  type BrainReadiness,
  type BrainReadinessDimension,
} from "@/lib/brain/readiness";
import type { BrainContext } from "@/lib/brain/context-contract";

type Admin = SupabaseClient;

export type BrainOpportunityStatus =
  | "suggested"
  | "approved"
  | "dismissed"
  | "in_progress"
  | "completed";

export type BrainOpportunityKind =
  | "knowledge_gap"
  | "voice"
  | "personalisation"
  | "reliability"
  | "market"
  | "growth";

export type BrainEffectivenessStatus =
  | "unmeasured"
  | "measuring"
  | "effective"
  | "mixed"
  | "ineffective";

export interface BrainOpportunity {
  id: string;
  client_id: string;
  diagnostic_run_id: string;
  brain_context_snapshot_id: string;
  kind: BrainOpportunityKind;
  title: string;
  summary: string;
  rationale: string;
  recommended_action: string;
  impact: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
  priority_score: number;
  source_layers: string[];
  company_provenance: Json;
  library_provenance: Json;
  status: BrainOpportunityStatus;
  effectiveness_status: BrainEffectivenessStatus;
  outcome: Json;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  measured_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Candidate {
  kind: BrainOpportunityKind;
  title: string;
  summary: string;
  rationale: string;
  recommendedAction: string;
  impact: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
  priorityScore: number;
  sourceLayers: string[];
  libraryProvenance: Array<{
    entryId: string;
    versionId: string;
    chunkId: string | null;
    versionNumber: number;
    title: string;
  }>;
}

const KIND_BY_DIMENSION: Record<BrainReadinessDimension["key"], BrainOpportunityKind> = {
  knowledge: "knowledge_gap",
  voice: "voice",
  personalisation: "personalisation",
  reliability: "reliability",
  market: "market",
};

const LAYERS_BY_DIMENSION: Record<BrainReadinessDimension["key"], string[]> = {
  knowledge: ["company_dna", "vault", "runtime"],
  voice: ["company_dna", "vault", "memory"],
  personalisation: ["memory"],
  reliability: ["runtime"],
  market: ["market"],
};

const EFFORT_BY_KIND: Record<BrainOpportunityKind, Candidate["effort"]> = {
  knowledge_gap: "medium",
  voice: "medium",
  personalisation: "low",
  reliability: "medium",
  market: "medium",
  growth: "medium",
};

function availableSourceLayers(context: BrainContext): Set<string> {
  return new Set([
    ...(Object.keys(context.company?.fields ?? {}).length ? ["company_dna"] : []),
    ...(context.knowledge?.sources?.length ? ["vault"] : []),
    ...(context.memories?.length ? ["memory"] : []),
    ...(context.market?.included && context.market.insights.length ? ["market"] : []),
    ...(context.library?.sources?.length ? ["library"] : []),
    "runtime",
  ]);
}

function bounded(value: string, max: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function impactFor(score: number): Candidate["impact"] {
  if (score < 40) return "high";
  if (score < 65) return "medium";
  return "low";
}

function priorityFor(score: number, effort: Candidate["effort"]): number {
  const urgency = Math.max(0, 100 - score);
  const ease = effort === "low" ? 15 : effort === "medium" ? 8 : 0;
  return Math.max(0, Math.min(100, Math.round(urgency * 0.85 + ease)));
}

function fingerprint(clientId: string, candidate: Candidate): string {
  return createHash("sha256")
    .update(`${clientId}:${candidate.kind}:${candidate.title.toLocaleLowerCase()}`)
    .digest("hex");
}

export function diagnosticCandidates(
  readiness: BrainReadiness,
  context: BrainContext,
): Candidate[] {
  const availableLayers = availableSourceLayers(context);
  const candidates: Candidate[] = readiness.dimensions
    .filter((dimension) => dimension.score < 80 && dimension.actions.length > 0)
    .map((dimension) => {
      const kind = KIND_BY_DIMENSION[dimension.key];
      const effort = EFFORT_BY_KIND[kind];
      return {
        kind,
        title: bounded(dimension.actions[0], 240),
        summary: bounded(dimension.summary, 2_000),
        rationale: bounded(
          `${dimension.label} is ${dimension.status} at ${dimension.score}%. ${dimension.evidence.join(" ")}`,
          4_000,
        ),
        recommendedAction: bounded(dimension.actions.join(" "), 2_000),
        impact: impactFor(dimension.score),
        effort,
        priorityScore: priorityFor(dimension.score, effort),
        sourceLayers: LAYERS_BY_DIMENSION[dimension.key]
          .filter((layer) => availableLayers.has(layer)),
        libraryProvenance: [],
      };
    });

  const librarySource = context.library.sources[0];
  if (librarySource && context.library.availability !== "unavailable") {
    const companyLayers = ["company_dna", "vault", "memory"]
      .filter((layer) => availableLayers.has(layer));
    const hasCompanyEvidence = companyLayers.length > 0;
    candidates.push({
      kind: "growth",
      title: bounded(`Review how ${librarySource.title} applies to the business`, 240),
      summary: bounded(
        `Published Library guidance suggests a potential improvement area: ${librarySource.excerpt}`,
        2_000,
      ),
      rationale: bounded(
        hasCompanyEvidence
          ? "This is general guidance, not a statement about current company practice. It should be approved only after comparing it with the company evidence in the same snapshot."
          : "This is general guidance, not a statement about current company practice. Company evidence is currently limited, so it requires owner verification before approval.",
        4_000,
      ),
      recommendedAction: bounded(
        `Review version ${librarySource.versionNumber} with the company owner, keep company facts authoritative, and approve a small measurable trial only if it fits.`,
        2_000,
      ),
      impact: "medium",
      effort: "medium",
      priorityScore: Math.round(55 + (librarySource.relevance ?? 0) * 20),
      sourceLayers: [...companyLayers, "library"],
      libraryProvenance: [{
        entryId: librarySource.entryId,
        versionId: librarySource.versionId,
        chunkId: librarySource.chunkId,
        versionNumber: librarySource.versionNumber,
        title: librarySource.title,
      }],
    });
  }

  return candidates
    .filter((candidate) => candidate.title && candidate.summary && candidate.recommendedAction)
    .sort((left, right) =>
      right.priorityScore - left.priorityScore ||
      left.title.localeCompare(right.title))
    .slice(0, 6);
}

export async function runBrainDiagnostic(args: {
  admin: Admin;
  clientId: string;
  triggerKind: "scheduled" | "manual";
  createdBy?: string | null;
}): Promise<{
  runId: string;
  snapshotId: string;
  created: number;
  /** Titles of the newly inserted rows only (already fingerprint-deduped). */
  createdTitles: string[];
  libraryAvailability: BrainContext["library"]["availability"];
}> {
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { error: staleError } = await args.admin
    .from("brain_diagnostic_runs")
    .update({
      status: "failed",
      error_code: "brain_diagnostic_timed_out",
      error_message: "The previous Brain diagnostic did not finish and can be retried.",
      recoverable: true,
      completed_at: now,
      updated_at: now,
    })
    .eq("client_id", args.clientId)
    .eq("status", "running")
    .lt("started_at", staleCutoff);
  if (staleError) {
    throw new Error(`Brain diagnostic recovery check failed: ${staleError.message}`);
  }

  const { data: run, error: runError } = await args.admin
    .from("brain_diagnostic_runs")
    .insert({
      client_id: args.clientId,
      trigger_kind: args.triggerKind,
      created_by: args.createdBy ?? null,
      status: "running",
      started_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (runError || !run?.id) {
    if (/brain_diagnostic_runs_one_running|duplicate key/iu.test(runError?.message ?? "")) {
      throw new Error("A Brain diagnostic is already running for this company.");
    }
    throw new Error(`Brain diagnostic could not start: ${runError?.message ?? "missing run"}`);
  }

  try {
    const [{ context }, readiness] = await Promise.all([
      resolveNodeBrainContext({
        admin: args.admin,
        clientId: args.clientId,
        request: {
          surface: "diagnostic",
          topic: "business growth, customer acquisition, SEO, advertising, operations and knowledge gaps",
          objective: "identify evidence-backed business opportunities that require human approval",
          intent: "scheduled proactive business diagnostic",
          selectedVaultSourceIds: [],
          includeMarketIntelligence: true,
        },
        model: null,
        promptVersion: "brain.diagnostic.v1",
        maxKnowledge: 20,
        maxLibrary: 10,
        maxMemory: 20,
      }),
      computeBrainReadiness(args.admin, args.clientId),
    ]);

    const snapshot = await persistNodeBrainContextSnapshot({
      admin: args.admin,
      context,
      artifactKind: "brain_diagnostic_run",
      artifactId: run.id,
      createdBy: args.createdBy ?? null,
    });
    const candidates = diagnosticCandidates(readiness, context);

    const { data: existing, error: existingError } = await args.admin
      .from("brain_opportunities")
      .select("fingerprint")
      .eq("client_id", args.clientId)
      .in("status", ["suggested", "approved", "in_progress"]);
    if (existingError) throw existingError;
    const existingFingerprints = new Set(
      ((existing ?? []) as Array<{ fingerprint: string }>).map((row) => row.fingerprint),
    );

    const companyProvenance = {
      snapshotId: snapshot.id,
      companyDnaUpdatedAt: context.provenance.companyDnaUpdatedAt,
      vaultItemIds: context.provenance.vaultItemIds,
      vaultChunkIds: context.provenance.vaultChunkIds,
      memoryIds: context.provenance.memoryIds,
      marketSnapshotIds: context.provenance.marketSnapshotIds,
    };
    const rows = candidates
      .map((candidate) => ({ candidate, fingerprint: fingerprint(args.clientId, candidate) }))
      .filter(({ fingerprint: value }) => !existingFingerprints.has(value))
      .map(({ candidate, fingerprint: value }) => ({
        client_id: args.clientId,
        diagnostic_run_id: run.id,
        brain_context_snapshot_id: snapshot.id,
        fingerprint: value,
        kind: candidate.kind,
        title: candidate.title,
        summary: candidate.summary,
        rationale: candidate.rationale,
        recommended_action: candidate.recommendedAction,
        impact: candidate.impact,
        effort: candidate.effort,
        priority_score: candidate.priorityScore,
        source_layers: candidate.sourceLayers,
        company_provenance: companyProvenance,
        library_provenance: candidate.libraryProvenance,
      }));

    let createdRows: Array<{ id: string; title: string }> = [];
    if (rows.length) {
      const { data, error } = await args.admin
        .from("brain_opportunities")
        .insert(rows)
        .select("id, title");
      if (error) throw error;
      createdRows = (data ?? []) as Array<{ id: string; title: string }>;
    }

    const { error: finishError } = await args.admin
      .from("brain_diagnostic_runs")
      .update({
        status: "completed",
        brain_context_snapshot_id: snapshot.id,
        opportunities_created: createdRows.length,
        summary: {
          readinessStatus: readiness.overallStatus,
          candidateCount: candidates.length,
          duplicateCount: candidates.length - rows.length,
          libraryAvailability: context.library.availability,
          warningCodes: context.warnings.map((warning) => warning.code),
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("client_id", args.clientId);
    if (finishError) throw finishError;

    return {
      runId: run.id,
      snapshotId: snapshot.id,
      created: createdRows.length,
      createdTitles: createdRows.map((row) => row.title),
      libraryAvailability: context.library.availability,
    };
  } catch (error) {
    const { error: cleanupError } = await args.admin
      .from("brain_opportunities")
      .delete()
      .eq("diagnostic_run_id", run.id)
      .eq("client_id", args.clientId);
    if (cleanupError) {
      console.error("[brain diagnostic] failed opportunity cleanup", cleanupError);
    }
    await args.admin
      .from("brain_diagnostic_runs")
      .update({
        status: "failed",
        error_code: "brain_diagnostic_failed",
        error_message: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown diagnostic failure.",
        recoverable: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("client_id", args.clientId);
    throw error;
  }
}

export async function listBrainOpportunities(
  admin: Admin,
  clientId: string,
): Promise<BrainOpportunity[]> {
  const { data, error } = await admin
    .from("brain_opportunities")
    .select(
      "id,client_id,diagnostic_run_id,brain_context_snapshot_id,kind,title,summary,rationale,recommended_action,impact,effort,priority_score,source_layers,company_provenance,library_provenance,status,effectiveness_status,outcome,approved_at,started_at,completed_at,measured_at,created_at,updated_at",
    )
    .eq("client_id", clientId)
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Brain opportunities could not be loaded: ${error.message}`);
  return (data ?? []) as BrainOpportunity[];
}
