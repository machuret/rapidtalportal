"use client";

import type { CompetitorIntelligenceRun } from "@/lib/competitors/intelligence";
import { EvidenceLinks } from "./EvidenceLinks";
import type { SourceById } from "./shared";

interface PositioningGapsSectionProps {
  run: CompetitorIntelligenceRun;
  sourceById: SourceById;
}

export function PositioningGapsSection({ run, sourceById }: PositioningGapsSectionProps) {
  return (
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
          <EvidenceLinks ids={gap.source_item_ids} quotes={gap.evidence_quotes} sourceById={sourceById} />
        </div>
      ))}
    </div>
  );
}
