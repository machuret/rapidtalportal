"use client";

import type { CompetitorIntelligenceRun } from "@/lib/competitors/intelligence";
import { EvidenceLinks } from "./EvidenceLinks";
import type { CompetitorById, SourceById } from "./shared";

interface OverviewSectionProps {
  run: CompetitorIntelligenceRun;
  competitorById: CompetitorById;
  sourceById: SourceById;
}

export function OverviewSection({ run, competitorById, sourceById }: OverviewSectionProps) {
  return (
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
            <EvidenceLinks ids={profile.source_item_ids} quotes={profile.evidence_quotes} sourceById={sourceById} />
          </div>
        ))}
      </div>
    </div>
  );
}
