"use client";

import type { CompetitorIntelligenceRun } from "@/lib/competitors/intelligence";
import { EvidenceLinks } from "./EvidenceLinks";
import { EMPTY_MARKET_MAP, type CompetitorById, type SourceById } from "./shared";

interface MarketMapSectionProps {
  run: CompetitorIntelligenceRun;
  competitorById: CompetitorById;
  sourceById: SourceById;
}

export function MarketMapSection({ run, competitorById, sourceById }: MarketMapSectionProps) {
  const marketMap = run.analysis.market_map ?? EMPTY_MARKET_MAP;
  return (
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
                <EvidenceLinks ids={change.source_item_ids} sourceById={sourceById} />
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
              <EvidenceLinks ids={recommendation.source_item_ids} sourceById={sourceById} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
