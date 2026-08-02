"use client";

import type { CompetitorIntelligenceRun } from "@/lib/competitors/intelligence";
import { EvidenceLinks } from "./EvidenceLinks";
import type { CompetitorById, SourceById } from "./shared";

interface ComparisonSectionProps {
  run: CompetitorIntelligenceRun;
  competitorById: CompetitorById;
  sourceById: SourceById;
}

export function ComparisonSection({ run, competitorById, sourceById }: ComparisonSectionProps) {
  return (
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
          <EvidenceLinks ids={comparison.source_item_ids} quotes={comparison.evidence_quotes} sourceById={sourceById} />
        </div>
      ))}
    </div>
  );
}
