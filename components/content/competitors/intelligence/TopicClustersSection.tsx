"use client";

import type { CompetitorIntelligenceRun } from "@/lib/competitors/intelligence";
import { EvidenceLinks } from "./EvidenceLinks";
import type { SourceById } from "./shared";

interface TopicClustersSectionProps {
  run: CompetitorIntelligenceRun;
  sourceById: SourceById;
}

export function TopicClustersSection({ run, sourceById }: TopicClustersSectionProps) {
  return (
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
          <EvidenceLinks ids={cluster.source_item_ids} quotes={cluster.evidence_quotes} sourceById={sourceById} />
        </div>
      ))}
    </div>
  );
}
