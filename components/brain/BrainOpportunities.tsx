"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Check,
  CheckCircle2,
  CircleGauge,
  Clock3,
  LibraryBig,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { LocalTime } from "@/components/ui/LocalTime";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import type {
  BrainEffectivenessStatus,
  BrainOpportunity,
} from "@/lib/brain/opportunities";
import type {
  BrainReadiness,
  BrainReadinessDimension,
} from "@/lib/brain/readiness";
import { brainOpportunityKeys, useBrainOpportunities } from "@/hooks/useBrainOpportunities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BrainContextUsed } from "@/components/brain/BrainContextUsed";

const STATUS_LABEL: Record<BrainOpportunity["status"], string> = {
  suggested: "Needs approval",
  approved: "Approved",
  dismissed: "Dismissed",
  in_progress: "In progress",
  completed: "Completed",
};

const EFFECT_LABEL: Record<BrainEffectivenessStatus, string> = {
  unmeasured: "Not measured",
  measuring: "Measuring",
  effective: "Effective",
  mixed: "Mixed result",
  ineffective: "Not effective",
};

const STATUS_STYLE: Record<BrainOpportunity["status"], string> = {
  suggested: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  approved: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  dismissed: "border-zinc-700 bg-zinc-800 text-zinc-400",
  in_progress: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

type View = "active" | "completed" | "all";

const NO_OPPORTUNITIES: BrainOpportunity[] = [];

const READINESS_KEY_BY_OPPORTUNITY: Partial<Record<BrainOpportunity["kind"], BrainReadinessDimension["key"]>> = {
  knowledge_gap: "knowledge",
  voice: "voice",
  personalisation: "personalisation",
  reliability: "reliability",
  market: "market",
};

export function currentReadinessForOpportunity(
  readiness: BrainReadiness,
  opportunity: Pick<BrainOpportunity, "kind">,
): BrainReadinessDimension | null {
  const key = READINESS_KEY_BY_OPPORTUNITY[opportunity.kind];
  return key ? readiness.dimensions.find((dimension) => dimension.key === key) ?? null : null;
}

export function BrainOpportunities({
  clientId,
  canManage,
  initialOpportunities,
  initialLoadFailed,
  readiness,
}: {
  clientId: string;
  canManage: boolean;
  initialOpportunities: BrainOpportunity[];
  initialLoadFailed: boolean;
  readiness: BrainReadiness;
}) {
  const queryClient = useQueryClient();
  // SSR-seeded when the page load succeeded; on SSR failure no data is seeded
  // so the unavailable/Retry state shows exactly as before (no auto-fetch —
  // the hook keeps the query disabled and only refetch() loads).
  const opportunitiesQuery = useBrainOpportunities(
    clientId,
    initialLoadFailed ? undefined : initialOpportunities,
  );
  const opportunities = opportunitiesQuery.data ?? NO_OPPORTUNITIES;
  const refreshing = opportunitiesQuery.isFetching;
  const loadFailed = opportunitiesQuery.isError || (initialLoadFailed && !opportunitiesQuery.isFetched);
  const [view, setView] = useState<View>("active");
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [effectiveness, setEffectiveness] = useState<BrainEffectivenessStatus>("effective");

  const visible = useMemo(() => opportunities.filter((opportunity) => {
    if (view === "all") return true;
    if (view === "completed") return opportunity.status === "completed";
    return !["completed", "dismissed"].includes(opportunity.status);
  }), [opportunities, view]);

  async function refresh(): Promise<boolean> {
    const result = await opportunitiesQuery.refetch();
    return !result.isError;
  }

  async function runDiagnostic() {
    if (running) return;
    setRunning(true);
    try {
      const result = await api.post<{
        created: number;
        libraryAvailability: string;
      }>(ROUTES.brain.opportunities(), { clientId }, { showErrorToast: false });
      const refreshed = await refresh();
      toast.success(
        result.created
          ? `${result.created} new Brain opportunit${result.created === 1 ? "y" : "ies"} found.`
          : "Diagnostic complete. No new opportunities were needed.",
      );
      if (!refreshed) {
        toast.warning("The diagnostic completed, but the opportunity list needs to be reloaded.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "The Brain diagnostic could not be completed. Please retry."));
    } finally {
      setRunning(false);
    }
  }

  async function act(
    opportunity: BrainOpportunity,
    action: "approve" | "dismiss" | "start" | "complete" | "reopen" | "measure",
    outcome?: Record<string, string>,
  ) {
    if (busyId) return;
    setBusyId(opportunity.id);
    try {
      const response = await api.patch<{ opportunity: BrainOpportunity }>(
        ROUTES.brain.opportunity(opportunity.id),
        { clientId, action, outcome: outcome ?? {} },
        { showErrorToast: false },
      );
      queryClient.setQueryData<BrainOpportunity[]>(
        brainOpportunityKeys.byClient(clientId),
        (current) => (current ?? []).map((item) =>
          item.id === opportunity.id ? response.opportunity : item),
      );
      setOutcomeId(null);
      setOutcomeNote("");
      toast.success("Opportunity updated.");
    } catch (error) {
      toast.error(errorMessage(error, "The opportunity could not be updated. Please retry."));
    } finally {
      setBusyId(null);
    }
  }

  function submitOutcome(opportunity: BrainOpportunity) {
    const action = opportunity.status === "completed" ? "measure" : "complete";
    void act(opportunity, action, {
      note: outcomeNote.trim(),
      effectivenessStatus: opportunity.status === "completed" ? effectiveness : "measuring",
    });
  }

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-400" />
            <h2 className="text-xl font-semibold text-white">Proactive opportunities</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
            Evidence-backed improvements found by scheduled Brain diagnostics. Nothing starts until a person approves it.
          </p>
        </div>
        {canManage && (
          <Button onClick={runDiagnostic} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
            {running ? "Running diagnostic…" : "Run diagnostic"}
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["active", "completed", "all"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              view === option
                ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {loadFailed && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4" role="alert">
          <div>
            <p className="text-sm font-medium text-amber-200">Opportunities temporarily unavailable</p>
            <p className="mt-1 text-xs text-amber-200/70">
              Existing opportunity data was not replaced or hidden permanently. Retry the load.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Retry
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="surface-card p-6">
          <p className="text-sm font-medium text-zinc-300">
            {opportunities.length
              ? "No opportunities match this view."
              : "No proactive opportunities have been generated yet."}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            The scheduled diagnostic runs weekly, or an authorised owner can run it now.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((opportunity) => {
            const libraryVersions = Array.isArray(opportunity.library_provenance)
              ? opportunity.library_provenance as Array<{
                versionId?: string;
                versionNumber?: number;
                title?: string;
              }>
              : [];
            const busy = busyId === opportunity.id;
            const currentDimension = currentReadinessForOpportunity(readiness, opportunity);
            const useCurrentMeasurement = opportunity.status === "suggested" && currentDimension !== null;
            const currentAction = currentDimension?.actions[0] ?? null;
            const noLongerNeedsAction = useCurrentMeasurement
              && (currentDimension.score >= 80 || currentAction === null);
            const displayedTitle = useCurrentMeasurement && currentAction
              ? currentAction
              : opportunity.title;
            const displayedSummary = useCurrentMeasurement
              ? currentDimension.summary
              : opportunity.summary;
            const displayedRationale = useCurrentMeasurement
              ? `${currentDimension.label} is currently ${currentDimension.status.replace("_", " ")} at ${currentDimension.score}%. ${currentDimension.evidence.join(" ")}`
              : opportunity.rationale;
            const displayedAction = useCurrentMeasurement
              ? currentDimension.actions.join(" ") || "No further action is required from this earlier suggestion."
              : opportunity.recommended_action;
            return (
              <article key={opportunity.id} className="surface-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        STATUS_STYLE[opportunity.status],
                      )}>
                        {STATUS_LABEL[opportunity.status]}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {useCurrentMeasurement
                          ? `Current readiness ${currentDimension.score}%`
                          : `Priority ${opportunity.priority_score}`}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-white">{displayedTitle}</h3>
                  </div>
                  <CircleGauge className="h-5 w-5 shrink-0 text-orange-400" />
                </div>

                <p className="mt-2 text-sm leading-6 text-zinc-300">{displayedSummary}</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">{displayedRationale}</p>

                {useCurrentMeasurement && (
                  <p className="mt-2 text-2xs text-zinc-600">
                    Current readiness measured <LocalTime value={readiness.measuredAt} />.
                    The original diagnostic snapshot remains available in “What the Brain used”.
                  </p>
                )}

                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="label-section">Recommended next step</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-300">{displayedAction}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span className="rounded-full border border-zinc-800 px-2 py-1">Impact: {opportunity.impact}</span>
                  <span className="rounded-full border border-zinc-800 px-2 py-1">Effort: {opportunity.effort}</span>
                  {opportunity.source_layers.map((layer) => (
                    <span key={layer} className="rounded-full border border-zinc-800 px-2 py-1">
                      {layer.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>

                {libraryVersions.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                    <LibraryBig className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                    <div>
                      <p className="text-xs font-medium text-orange-200">Versioned Library guidance</p>
                      {libraryVersions.map((source) => (
                        <p key={source.versionId} className="mt-0.5 text-xs text-orange-200/70">
                          {source.title ?? "Published guidance"} · version {source.versionNumber ?? "recorded"}
                        </p>
                      ))}
                      <p className="mt-1 text-xs text-zinc-500">Company evidence remains authoritative.</p>
                    </div>
                  </div>
                )}

                {opportunity.status === "completed" && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Effectiveness: {EFFECT_LABEL[opportunity.effectiveness_status]}
                  </div>
                )}

                {outcomeId === opportunity.id && (
                  <div className="mt-4 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                    <Textarea
                      value={outcomeNote}
                      onChange={(event) => setOutcomeNote(event.target.value)}
                      rows={3}
                      placeholder={opportunity.status === "completed"
                        ? "What changed, and what evidence supports the result?"
                        : "What will be measured after this work is completed?"}
                      className="bg-zinc-950"
                    />
                    {opportunity.status === "completed" && (
                      <select
                        value={effectiveness}
                        onChange={(event) => setEffectiveness(event.target.value as BrainEffectivenessStatus)}
                        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
                      >
                        <option value="effective">Effective</option>
                        <option value="mixed">Mixed result</option>
                        <option value="ineffective">Not effective</option>
                        <option value="measuring">Still measuring</option>
                      </select>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => submitOutcome(opportunity)} disabled={busy}>
                        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                        Save outcome
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setOutcomeId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {canManage && outcomeId !== opportunity.id && (
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                    {opportunity.status === "suggested" && !noLongerNeedsAction && (
                      <>
                        <Button size="sm" onClick={() => void act(opportunity, "approve")} disabled={busy}>
                          <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void act(opportunity, "dismiss")} disabled={busy}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Dismiss
                        </Button>
                      </>
                    )}
                    {opportunity.status === "suggested" && noLongerNeedsAction && (
                      <Button size="sm" variant="outline" onClick={() => void act(opportunity, "dismiss")} disabled={busy}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark resolved
                      </Button>
                    )}
                    {opportunity.status === "approved" && (
                      <>
                        <Button size="sm" onClick={() => void act(opportunity, "start")} disabled={busy}>
                          <Play className="mr-1.5 h-3.5 w-3.5" /> Start
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void act(opportunity, "dismiss")} disabled={busy}>
                          Dismiss
                        </Button>
                      </>
                    )}
                    {opportunity.status === "in_progress" && (
                      <Button size="sm" onClick={() => setOutcomeId(opportunity.id)}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Complete
                      </Button>
                    )}
                    {opportunity.status === "completed" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setOutcomeId(opportunity.id)}>
                          <Clock3 className="mr-1.5 h-3.5 w-3.5" /> Measure result
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void act(opportunity, "reopen")} disabled={busy}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reopen
                        </Button>
                      </>
                    )}
                    {opportunity.status === "dismissed" && (
                      <Button size="sm" variant="outline" onClick={() => void act(opportunity, "reopen")} disabled={busy}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reconsider
                      </Button>
                    )}
                  </div>
                )}
                <div className="mt-4">
                  <BrainContextUsed
                    clientId={clientId}
                    snapshotId={opportunity.brain_context_snapshot_id}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
