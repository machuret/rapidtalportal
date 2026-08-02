"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  FileStack,
  Lightbulb,
  Loader2,
  RefreshCw,
  Radar,
  Scale,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { Competitor } from "@/types/competitors";
import type {
  CompetitorIntelligenceIdea,
  CompetitorIntelligenceJob,
  CompetitorIntelligenceRun,
} from "@/lib/competitors/intelligence";
import { Button } from "@/components/ui/button";
import { ComparisonSection } from "./ComparisonSection";
import { FormatsSection } from "./FormatsSection";
import { MarketMapSection } from "./MarketMapSection";
import { OverviewSection } from "./OverviewSection";
import { PositioningGapsSection } from "./PositioningGapsSection";
import { RecommendedIdeasSection } from "./RecommendedIdeasSection";
import { TopicClustersSection } from "./TopicClustersSection";
import { readableDate } from "./shared";

interface Props {
  clientId: string;
  canManage: boolean;
  competitors: Competitor[];
  onIdeaSelected?: (
    idea: CompetitorIntelligenceIdea,
    run: CompetitorIntelligenceRun,
  ) => void;
}

type Section = "overview" | "market-map" | "topics" | "formats" | "comparison" | "gaps" | "ideas";

const sections: Array<{ id: Section; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "market-map", label: "Market map", icon: Radar },
  { id: "topics", label: "Topic clusters", icon: BookOpen },
  { id: "formats", label: "Formats", icon: FileStack },
  { id: "comparison", label: "Comparison", icon: Scale },
  { id: "gaps", label: "Positioning gaps", icon: Target },
  { id: "ideas", label: "Recommended ideas", icon: Lightbulb },
];

export function CompetitorIntelligencePanel({
  clientId,
  canManage,
  competitors,
  onIdeaSelected,
}: Props) {
  const [run, setRun] = useState<CompetitorIntelligenceRun | null>(null);
  const [activeJob, setActiveJob] = useState<CompetitorIntelligenceJob | null>(null);
  const [lastJob, setLastJob] = useState<CompetitorIntelligenceJob | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [windowDays, setWindowDays] = useState(180);
  const readyCompetitors = useMemo(
    () => competitors.filter((competitor) =>
      competitor.status === "active" && competitor.readiness.ready),
    [competitors],
  );
  const buildingCompetitors = useMemo(
    () => competitors.filter((competitor) =>
      competitor.status === "active" && !competitor.readiness.ready),
    [competitors],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedLimitations = useMemo(
    () => readyCompetitors
      .filter((competitor) => selectedIds.has(competitor.id))
      .flatMap((competitor) => [
        ...competitor.readiness.limitations.map((limitation) =>
          `${competitor.name}: ${limitation}`),
        ...competitor.identity_warnings.map((warning) =>
          `${competitor.name}: ${warning}`),
      ]),
    [readyCompetitors, selectedIds],
  );

  const loadReport = useCallback(async (showLoading = false, silent = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await api.get<{
        run: CompetitorIntelligenceRun | null;
        active_job: CompetitorIntelligenceJob | null;
        last_job: CompetitorIntelligenceJob | null;
      }>(
      ROUTES.content.competitorIntelligenceForClient(clientId),
      { showErrorToast: false },
      );
      setRun(result.run);
      setActiveJob(result.active_job);
      setLastJob(result.last_job);
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Competitor intelligence could not be loaded.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void loadReport(true); }, [loadReport]);

  useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => void loadReport(false, true), 4000);
    return () => window.clearInterval(timer);
  }, [activeJob, loadReport]);

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = new Set(readyCompetitors.map((competitor) => competitor.id));
      const retained = new Set([...current].filter((id) => valid.has(id)));
      return retained.size > 0 ? retained : valid;
    });
  }, [readyCompetitors]);

  const sourceById = useMemo(
    () => new Map((run?.sources ?? []).map((source) => [source.id, source])),
    [run?.sources],
  );
  const competitorById = useMemo(
    () => new Map(competitors.map((competitor) => [competitor.id, competitor])),
    [competitors],
  );
  const reportIsStale = useMemo(() => {
    if (!run) return false;
    const included = new Set(run.competitor_ids);
    const reportCreatedAt = new Date(run.created_at).getTime();
    return competitors.some((competitor) =>
      included.has(competitor.id) &&
      competitor.readiness.latest_capture !== null &&
      new Date(competitor.readiness.latest_capture).getTime() > reportCreatedAt);
  }, [competitors, run]);
  const incompleteSections = useMemo(() => {
    if (!run) return [];
    return [
      ["topic clusters", run.analysis.topic_clusters.length],
      ["format patterns", run.analysis.format_patterns.length],
      ["positioning profiles", run.analysis.positioning_profiles.length],
      ["comparisons", run.analysis.comparisons.length],
      ["positioning gaps", run.analysis.positioning_gaps.length],
      ["recommended ideas", run.analysis.recommended_ideas.length],
    ].filter(([, count]) => count === 0).map(([label]) => String(label));
  }, [run]);

  function toggleCompetitor(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function analyse() {
    if (selectedIds.size === 0) {
      toast.error("Select at least one evidence-ready competitor.");
      return;
    }
    setAnalysing(true);
    setAnalysisError(null);
    try {
      const result = await api.post<{
        run: CompetitorIntelligenceRun;
        active_job: null;
      }>(
        ROUTES.content.competitorIntelligence(),
        {
          client_id: clientId,
          competitor_ids: [...selectedIds],
          window_days: windowDays,
        },
        { showErrorToast: false },
      );
      setRun(result.run);
      setActiveJob(null);
      setLastJob(null);
      setSection("overview");
      toast.success("Competitor intelligence report created.");
    } catch (error) {
      // A second tab or user may have acquired the durable lease after this
      // panel was loaded. Refresh so the shared in-progress state is visible.
      await loadReport(false, true);
      setAnalysisError(error instanceof Error ? error.message : "Competitor analysis failed.");
    } finally {
      setAnalysing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the latest intelligence report…
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-orange-500/25 bg-orange-500/5">
      <div className="border-b border-orange-500/20 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-300" />
              <h3 className="font-semibold text-white">Market intelligence report</h3>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
              Evidence-backed topic clusters, recurring formats, competitor positioning and differentiated content opportunities.
              Competitor material is inspiration only—not proof for claims about your company.
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs text-zinc-500">
                <span>Analysis window</span>
                <select
                  value={windowDays}
                  onChange={(event) => setWindowDays(Number(event.target.value))}
                  className="block h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-200"
                >
                  <option value={90}>Last 90 days</option>
                  <option value={180}>Last 180 days</option>
                  <option value={365}>Last 12 months</option>
                </select>
              </label>
              <Button
                type="button"
                data-testid="competitor-analyse-button"
                onClick={() => void analyse()}
                disabled={analysing || !!activeJob || selectedIds.size === 0}
                className="bg-orange-500 text-white hover:bg-orange-400"
              >
                {analysing || activeJob ? <Loader2 className="animate-spin" /> : run ? <RefreshCw /> : <Sparkles />}
                {analysing || activeJob ? "Analysis running…" : run ? "Refresh report" : "Analyse competitors"}
              </Button>
            </div>
          )}
        </div>

        {canManage && readyCompetitors.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-zinc-500">Competitors included in this report</p>
            <div className="flex flex-wrap gap-2">
              {readyCompetitors.map((competitor) => (
                <button
                  key={competitor.id}
                  type="button"
                  onClick={() => toggleCompetitor(competitor.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    selectedIds.has(competitor.id)
                      ? "border-orange-400/50 bg-orange-500/15 text-orange-100"
                      : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {competitor.name} · {competitor.readiness.content_strategy_ready
                    ? "content-ready"
                    : "positioning-only"}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedLimitations.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-amber-200">Report scope limitations</p>
            <ul className="mt-1 space-y-1 text-xs leading-5 text-amber-200/80">
              {selectedLimitations.slice(0, 6).map((limitation) => (
                <li key={limitation}>• {limitation}</li>
              ))}
            </ul>
          </div>
        )}
        {canManage && buildingCompetitors.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs font-medium text-zinc-400">Still collecting enough evidence</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {buildingCompetitors.map((competitor) => (
                <div key={competitor.id} className="rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-500">
                  <p className="font-medium text-zinc-300">{competitor.name}</p>
                  <p className="mt-1">
                    {competitor.readiness.captured_items}/5 items · {competitor.readiness.content_characters.toLocaleString()}/2,500 characters
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-600">Captured content remains analysable even if its original source is later paused.</p>
          </div>
        )}
      </div>

      {activeJob && (
        <div className="border-b border-blue-500/20 bg-blue-500/5 px-5 py-3 text-sm text-blue-200">
          An analysis started {readableDate(activeJob.started_at)} and is running safely in one leased job.
          This report will refresh automatically when it finishes.
        </div>
      )}

      {!activeJob && (analysisError || lastJob?.status === "failed") && (
        <div className="border-b border-red-500/20 bg-red-500/5 px-5 py-4" role="alert">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-200">The latest analysis did not finish</p>
              <p className="mt-1 text-sm leading-5 text-zinc-300">
                {analysisError || lastJob?.error_message || "The report could not be completed."}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {run
                  ? "Your previous valid report is still available below."
                  : "No previous report was replaced."}
                {lastJob?.error_code ? ` Reference: ${lastJob.error_code}.` : ""}
              </p>
            </div>
            {canManage && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={analysing || selectedIds.size === 0}
                onClick={() => void analyse()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry analysis
              </Button>
            )}
          </div>
        </div>
      )}

      {!run ? (
        <div className="px-5 py-10 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 font-medium text-zinc-300">No intelligence report yet</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-zinc-500">
            {readyCompetitors.length > 0
              ? "Analyse the evidence-ready competitor mini-vaults to find repeatable market signals and content opportunities."
              : "Collect at least 5 recent items and 2,500 characters for a competitor before running analysis."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-4 py-2">
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                    section === item.id
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>
                {readableDate(run.window_start)}–{readableDate(run.window_end)} · {run.source_count} sources ·{" "}
                {run.source_character_count.toLocaleString()} characters
              </span>
              <span className={reportIsStale ? "text-amber-300" : ""}>
                Generated {readableDate(run.created_at)}
                {reportIsStale ? " · refresh recommended" : ""}
              </span>
            </div>
            {run.fallback_date_count > 0 && (
              <p className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                {run.fallback_date_count} source{run.fallback_date_count === 1 ? "" : "s"} had no publication date.
                Their collection date was used explicitly as a fallback and is marked on the evidence link.
              </p>
            )}
            {incompleteSections.length > 0 && (
              <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-xs leading-5 text-amber-100">
                <p className="font-medium">Verified partial report</p>
                <p className="mt-1 text-amber-200/80">
                  The available evidence did not safely support: {incompleteSections.join(", ")}.
                  Verified sections were preserved instead of discarding the entire report.
                </p>
              </div>
            )}

            {section === "overview" && (
              <OverviewSection run={run} competitorById={competitorById} sourceById={sourceById} />
            )}
            {section === "market-map" && (
              <MarketMapSection run={run} competitorById={competitorById} sourceById={sourceById} />
            )}
            {section === "topics" && (
              <TopicClustersSection run={run} sourceById={sourceById} />
            )}
            {section === "formats" && (
              <FormatsSection run={run} sourceById={sourceById} />
            )}
            {section === "comparison" && (
              <ComparisonSection run={run} competitorById={competitorById} sourceById={sourceById} />
            )}
            {section === "gaps" && (
              <PositioningGapsSection run={run} sourceById={sourceById} />
            )}
            {section === "ideas" && (
              <RecommendedIdeasSection run={run} sourceById={sourceById} onIdeaSelected={onIdeaSelected} />
            )}
          </div>
        </>
      )}
    </section>
  );
}
