"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ExternalLink,
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

const EMPTY_MARKET_MAP = {
  topic_ownership: [],
  shared_narratives: [],
  audience_segments: [],
  cta_patterns: [],
  recurring_vocabulary: [],
  recent_changes: [],
  saturated_topics: [],
  weakly_covered_topics: [],
  strategic_recommendations: [],
} as const;

function readableDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

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
  const marketMap = run?.analysis.market_map ?? EMPTY_MARKET_MAP;
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

  function evidenceLinks(
    ids: string[],
    quotes: Array<{ source_item_id: string; quote: string }> = [],
  ) {
    const quoteById = new Map(quotes.map((quote) => [quote.source_item_id, quote.quote]));
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const source = sourceById.get(id);
          return source ? (
            <a
              key={id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={[
                quoteById.get(id) ? `Verified excerpt: “${quoteById.get(id)}”` : source.title,
                source.date_basis === "captured"
                  ? "Publication date unavailable; collection date used."
                  : `Published ${readableDate(source.effective_at)}`,
              ].join("\n")}
              className="inline-flex max-w-56 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              <span className="truncate">
                {source.competitor_name}: {source.title}
                {source.date_basis === "captured" ? " · date estimated" : ""}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span key={id} className="rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-600">
              Source unavailable
            </span>
          );
        })}
      </div>
    );
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
              <div className="space-y-5">
                <p className="max-w-4xl text-sm leading-6 text-zinc-300">{run.analysis.executive_summary}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Topic clusters", run.analysis.topic_clusters.length],
                    ["Format patterns", run.analysis.format_patterns.length],
                    ["Positioning gaps", run.analysis.positioning_gaps.length],
                    ["Recommended ideas", run.analysis.recommended_ideas.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-xs text-zinc-500">{label}</p>
                      <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {run.analysis.positioning_profiles.map((profile) => (
                    <div key={profile.competitor_id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                      <p className="text-sm font-semibold text-zinc-200">
                        {competitorById.get(profile.competitor_id)?.name ?? "Competitor"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">{profile.summary}</p>
                      <p className="mt-3 text-xs text-zinc-500">Themes: {profile.themes.join(" · ")}</p>
                      {evidenceLinks(profile.source_item_ids, profile.evidence_quotes)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section === "market-map" && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Shared narratives", marketMap.shared_narratives.length],
                    ["Recent changes", marketMap.recent_changes.length],
                    ["Saturated topics", marketMap.saturated_topics.length],
                    ["Open opportunities", marketMap.weakly_covered_topics.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-xs text-zinc-500">{label}</p>
                      <p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <p className="text-sm font-semibold text-zinc-200">Topic ownership</p>
                    <div className="mt-3 space-y-2">
                      {marketMap.topic_ownership.length ? (
                        marketMap.topic_ownership.map((ownership) => {
                          const cluster = run.analysis.topic_clusters.find(
                            (item) => item.id === ownership.topic_cluster_id,
                          );
                          return (
                            <div
                              key={`${ownership.topic_cluster_id}-${ownership.competitor_id}`}
                              className="flex items-center justify-between gap-3 rounded border border-zinc-800 px-3 py-2 text-xs"
                            >
                              <span className="text-zinc-400">
                                {cluster?.label ?? ownership.topic_cluster_id} ·{" "}
                                {competitorById.get(ownership.competitor_id)?.name ?? "Competitor"}
                              </span>
                              <span className="font-medium text-orange-300">{ownership.source_share}%</span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-zinc-500">No topic ownership could be verified yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <p className="text-sm font-semibold text-zinc-200">Recurring market vocabulary</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {marketMap.recurring_vocabulary.length ? (
                        marketMap.recurring_vocabulary.map((entry) => (
                          <span
                            key={entry.term}
                            title={`${entry.source_item_ids.length} verified captures`}
                            className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400"
                          >
                            {entry.term}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-500">No recurring vocabulary could be verified yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {marketMap.recent_changes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">Recent market movement</p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {marketMap.recent_changes.map((change) => (
                        <div key={`${change.kind}-${change.label}`} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                          <p className="text-xs uppercase tracking-wide text-blue-300">
                            {change.kind.replace(/_/gu, " ")} · {change.confidence} confidence
                          </p>
                          <p className="mt-1 text-sm font-semibold text-zinc-200">{change.label}</p>
                          <p className="mt-2 text-sm leading-6 text-zinc-400">{change.summary}</p>
                          {evidenceLinks(change.source_item_ids)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-zinc-200">Strategic recommendations</p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {marketMap.strategic_recommendations.map((recommendation) => (
                      <div key={recommendation.title} className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-zinc-200">{recommendation.title}</p>
                          <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs capitalize text-zinc-400">
                            {recommendation.opportunity_horizon}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{recommendation.recommendation}</p>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">{recommendation.rationale}</p>
                        <p className="mt-3 text-xs text-zinc-500">
                          Market confidence: {recommendation.market_confidence} · Company evidence:{" "}
                          {recommendation.company_evidence_strength}
                        </p>
                        {evidenceLinks(recommendation.source_item_ids)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {section === "topics" && (
              <div className="grid gap-3 lg:grid-cols-2">
                {run.analysis.topic_clusters.map((cluster) => (
                  <div key={cluster.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">{cluster.label}</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">{cluster.description}</p>
                      </div>
                      <span className="rounded-full border border-orange-500/25 px-2 py-1 text-xs capitalize text-orange-300">
                        {cluster.signal_strength}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">Channels: {cluster.channels.join(", ")}</p>
                    {evidenceLinks(cluster.source_item_ids, cluster.evidence_quotes)}
                  </div>
                ))}
              </div>
            )}

            {section === "formats" && (
              <div className="grid gap-3 lg:grid-cols-2">
                {run.analysis.format_patterns.map((format) => (
                  <div key={format.name} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <p className="text-sm font-semibold text-zinc-200">{format.name}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{format.description}</p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div><dt className="text-zinc-600">Hook</dt><dd className="text-zinc-400">{format.hook_pattern || "No consistent pattern"}</dd></div>
                      <div><dt className="text-zinc-600">Structure</dt><dd className="text-zinc-400">{format.structure_pattern || "No consistent pattern"}</dd></div>
                      <div><dt className="text-zinc-600">CTA</dt><dd className="text-zinc-400">{format.cta_pattern || "No consistent pattern"}</dd></div>
                    </dl>
                    {evidenceLinks(format.source_item_ids, format.evidence_quotes)}
                  </div>
                ))}
              </div>
            )}

            {section === "comparison" && (
              <div className="space-y-3">
                {run.analysis.comparisons.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
                    Select at least two evidence-ready competitors for direct comparisons.
                  </p>
                ) : run.analysis.comparisons.map((comparison) => (
                  <div key={comparison.dimension} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <p className="text-sm font-semibold text-zinc-200">{comparison.dimension}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {comparison.observations.map((observation) => (
                        <div key={observation.competitor_id} className="rounded border border-zinc-800 p-3">
                          <p className="text-xs font-medium text-zinc-300">
                            {competitorById.get(observation.competitor_id)?.name ?? "Competitor"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">{observation.value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-orange-200/80">Opportunity: {comparison.opportunity}</p>
                    {evidenceLinks(comparison.source_item_ids, comparison.evidence_quotes)}
                  </div>
                ))}
              </div>
            )}

            {section === "gaps" && (
              <div className="grid gap-3 lg:grid-cols-2">
                {run.analysis.positioning_gaps.map((gap) => (
                  <div key={gap.title} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-200">{gap.title}</p>
                      <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs capitalize text-zinc-400">
                        {gap.gap_type.replace(/_/gu, " ")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{gap.description}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{gap.rationale}</p>
                    <p className="mt-3 text-xs text-zinc-500">
                      Company fit: {gap.company_fit} · Suggested: {gap.recommended_channels.join(", ")}
                    </p>
                    {evidenceLinks(gap.source_item_ids, gap.evidence_quotes)}
                  </div>
                ))}
              </div>
            )}

            {section === "ideas" && (
              <div className="grid gap-3 lg:grid-cols-2">
                {run.analysis.recommended_ideas.map((idea) => (
                  <div key={`${idea.channel}-${idea.title}`} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-orange-300">{idea.channel} · {idea.format}</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-200">{idea.title}</p>
                      </div>
                      <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs capitalize text-zinc-400">
                        {idea.confidence}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{idea.why_valuable}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Company relevance: {idea.company_relevance ?? idea.objective}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Different from existing company content:{" "}
                      {idea.difference_from_company_content ??
                        (idea.overlap_warning ||
                          "No close overlap was identified in the compared company references.")}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Differentiation: {idea.differentiation}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Suggested hook: “{idea.suggested_hook}”
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Compared with company content/Vault: <span className="capitalize">{idea.novelty}</span>
                      {idea.overlap_warning ? ` · ${idea.overlap_warning}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Market confidence: {idea.market_confidence ?? idea.confidence} · Company evidence:{" "}
                      {idea.company_evidence_strength ?? "none"} · Opportunity:{" "}
                      {idea.opportunity_horizon ?? "evergreen"}
                    </p>
                    {idea.company_reference_ids.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {idea.company_reference_ids.map((id) => {
                          const source = run.company_sources.find((candidate) => candidate.id === id);
                          return source ? (
                            <span
                              key={id}
                              title={source.excerpt}
                              className="rounded-full border border-purple-500/25 bg-purple-500/5 px-2 py-1 text-xs text-purple-200"
                            >
                              {source.kind === "vault_item" ? "Vault" : "Company content"}: {source.title}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                    {evidenceLinks(idea.source_item_ids, idea.evidence_quotes)}
                    {onIdeaSelected && (
                      <div className="mt-4 flex justify-end">
                        <Button type="button" size="sm" onClick={() => onIdeaSelected(idea, run)}>
                          Build content brief
                          <ArrowRight />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
