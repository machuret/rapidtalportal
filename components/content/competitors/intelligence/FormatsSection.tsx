"use client";

import type { CompetitorIntelligenceRun } from "@/lib/competitors/intelligence";
import { EvidenceLinks } from "./EvidenceLinks";
import type { SourceById } from "./shared";

interface FormatsSectionProps {
  run: CompetitorIntelligenceRun;
  sourceById: SourceById;
}

export function FormatsSection({ run, sourceById }: FormatsSectionProps) {
  return (
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
          <EvidenceLinks ids={format.source_item_ids} quotes={format.evidence_quotes} sourceById={sourceById} />
        </div>
      ))}
    </div>
  );
}
