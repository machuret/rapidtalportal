"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Loader2,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { VAULT_CATEGORIES } from "@/lib/taxonomy/vault-categories";
import type {
  VaultReadiness,
  VaultReadinessAction,
} from "@/lib/vault/readiness";
import type { VaultCategory } from "@/types/database";
import { Button } from "@/components/ui/button";
import { VaultKnowledgeFlow } from "@/components/intelligence/VaultKnowledgeFlow";
import { KnowledgeGaps } from "./KnowledgeGaps";

interface Props {
  clientId: string;
  canCurate: boolean;
  canIndex: boolean;
  version: string;
  onAdd: () => void;
  onIndex: () => Promise<void>;
}

const statusClasses: Record<VaultReadiness["status"], string> = {
  setup: "border-zinc-700 bg-zinc-900 text-zinc-300",
  needs_attention: "border-red-500/30 bg-red-500/10 text-red-200",
  developing: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

export function VaultReadinessDashboard({
  clientId,
  canCurate,
  canIndex,
  version,
  onAdd,
  onIndex,
}: Props) {
  const [readiness, setReadiness] = useState<VaultReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<VaultReadinessAction>(null);
  const [showGaps, setShowGaps] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.get<VaultReadiness>(
        `${ROUTES.vault.readiness()}?clientId=${clientId}`,
        { showErrorToast: false },
      );
      setReadiness(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, "Vault readiness could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, version]);

  const runAction = useCallback(async (action: VaultReadinessAction) => {
    if (!action || runningAction) return;
    if (action === "add") {
      onAdd();
      return;
    }
    if (action === "gaps") {
      setShowGaps(true);
      window.setTimeout(() => {
        document.getElementById("vault-readiness-gaps")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      return;
    }
    if (action === "ask") {
      window.location.assign("/ask");
      return;
    }
    if (action === "review") {
      document.getElementById("vault-source-list")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    setRunningAction(action);
    try {
      await onIndex();
      await load();
    } finally {
      setRunningAction(null);
    }
  }, [load, onAdd, onIndex, runningAction]);

  if (loading && !readiness) {
    return (
      <section className="mb-6 flex min-h-44 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </section>
    );
  }

  if (loadError && !readiness) {
    return (
      <section className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-red-300" />
        <p className="mt-2 font-medium text-red-200">Vault readiness unavailable</p>
        <p className="mt-1 text-sm text-red-300/80">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
        </Button>
      </section>
    );
  }

  if (!readiness) return null;

  const metrics = [
    {
      label: "Usable facts",
      value: `${readiness.metrics.ready}/${readiness.metrics.total}`,
      detail: readiness.metrics.processing
        ? `${readiness.metrics.processing} processing`
        : readiness.metrics.stuckProcessing
          ? `${readiness.metrics.stuckProcessing} stuck — restart required`
          : "Processing complete",
      icon: BookOpenCheck,
    },
    {
      label: "Available to AI",
      value: `${readiness.metrics.searchable}/${readiness.metrics.ready}`,
      detail: readiness.metrics.failed || readiness.metrics.stuckProcessing
        ? [
            readiness.metrics.failed ? `${readiness.metrics.failed} failed` : "",
            readiness.metrics.stuckProcessing ? `${readiness.metrics.stuckProcessing} stuck` : "",
          ].filter(Boolean).join(" · ")
        : "No failed sources",
      icon: SearchCheck,
    },
    {
      label: "Needs freshness review",
      value: readiness.metrics.stale,
      detail: `Older than ${readiness.freshnessWindowDays} days`,
      icon: CalendarClock,
    },
    {
      label: "Open knowledge gaps",
      value: readiness.metrics.openGaps,
      detail: readiness.metrics.questionsTested
        ? `${readiness.metrics.questionsTested} real question${readiness.metrics.questionsTested === 1 ? "" : "s"} tested`
        : "No real questions tested yet",
      icon: AlertTriangle,
    },
  ];

  return (
    <section className="mb-6 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
      <VaultKnowledgeFlow readiness={readiness} />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border ${statusClasses[readiness.status]}`}>
            <span className="text-2xl font-bold">{readiness.score}</span>
            <span className="text-2xs uppercase tracking-wide opacity-70">out of 100</span>
          </div>
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Gauge className="h-3.5 w-3.5" /> Knowledge readiness
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">{readiness.label}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">{readiness.summary}</p>
            <p className="mt-1 text-xs text-zinc-600">
              Measures usable Vault knowledge. It is separate from account setup, Company DNA completion and Brain learning.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading
            ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">{metric.label}</p>
              <metric.icon className="h-4 w-4 text-zinc-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">{metric.value}</p>
            <p className="mt-1 text-xs text-zinc-600">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Knowledge coverage</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(readiness.categoryCounts).map(([category, count]) => {
              const vaultCategory = category as VaultCategory;
              const meta = VAULT_CATEGORIES[vaultCategory];
              const missing = readiness.missingCoreCategories.includes(vaultCategory);
              return (
                <span
                  key={category}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    missing
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : count > 0
                        ? meta.badgeClass
                        : "border-zinc-800 bg-zinc-900 text-zinc-600"
                  }`}
                >
                  {meta.shortLabel}: {count}{missing ? " · missing" : ""}
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-600">
            Core readiness expects company services, processes, policies and reference knowledge.
          </p>

          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Subject strength
          </p>
          {readiness.topics.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {readiness.topics.map((topic) => (
                <span
                  key={topic.topic}
                  title={`${topic.sourceCount} usable source${topic.sourceCount === 1 ? "" : "s"}${topic.authoritativeCount ? ` · ${topic.authoritativeCount} authoritative` : ""}`}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    topic.strength === "strong"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : topic.strength === "moderate"
                        ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {topic.topic} · {topic.sourceCount}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Add or review source topics to see where company knowledge is strong or thin.
            </p>
          )}
          {readiness.thinTopics.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-amber-300/80">
              Thin coverage: {readiness.thinTopics.map((topic) => topic.topic).join(", ")}.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recommended next actions</p>
          <div className="mt-3 space-y-2">
            {readiness.recommendations.slice(0, 4).map((recommendation) => {
              const actionAvailable =
                recommendation.action !== "index" || canIndex;
              return (
                <div key={recommendation.id} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  {recommendation.priority === "high"
                    ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                    : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200">{recommendation.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{recommendation.detail}</p>
                  </div>
                  {recommendation.action && actionAvailable && (
                    <button
                      type="button"
                      disabled={runningAction !== null}
                      onClick={() => void runAction(recommendation.action)}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-purple-300 hover:text-purple-200 disabled:opacity-50"
                    >
                      {runningAction === recommendation.action
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <ArrowRight className="h-3.5 w-3.5" />}
                      {recommendation.action === "add"
                        ? "Add knowledge"
                        : recommendation.action === "index"
                          ? "Fix now"
                          : recommendation.action === "ask"
                            ? "Test now"
                            : recommendation.action === "review"
                              ? "Review sources"
                          : "Review"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 border-t border-zinc-800 pt-4 text-xs sm:grid-cols-4">
        <p className="text-zinc-500">
          <span className="font-semibold text-zinc-200">{readiness.metrics.authoritative}</span>{" "}
          authoritative sources
        </p>
        <p className="text-zinc-500">
          <span className="font-semibold text-zinc-200">{readiness.metrics.supporting}</span>{" "}
          supporting sources
        </p>
        <p className="text-zinc-500">
          <span className="font-semibold text-zinc-200">{readiness.metrics.timeSensitive}</span>{" "}
          time-sensitive
        </p>
        <p className={
          readiness.metrics.reviewRequired + readiness.metrics.expired + readiness.metrics.conflicted > 0
            ? "text-red-300"
            : "text-zinc-500"
        }>
          <span className="font-semibold">
            {readiness.metrics.reviewRequired + readiness.metrics.expired + readiness.metrics.conflicted}
          </span>{" "}
          requiring governance
        </p>
      </div>

      {showGaps && (
        <div id="vault-readiness-gaps" className="mt-5 border-t border-zinc-800 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-200">Open knowledge gaps</p>
              <p className="text-xs text-zinc-500">Answer a question to make it available to Ask the Brain.</p>
            </div>
            <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setShowGaps(false)}>
              Hide
            </button>
          </div>
          <KnowledgeGaps
            gaps={readiness.knowledgeGaps}
            clientId={clientId}
            canCurate={canCurate}
            onChanged={() => void load()}
          />
        </div>
      )}
    </section>
  );
}
