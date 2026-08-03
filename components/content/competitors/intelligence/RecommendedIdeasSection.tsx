"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type {
  CompetitorIntelligenceIdea,
  CompetitorIntelligenceRun,
} from "@/lib/competitors/intelligence";
import { Button } from "@/components/ui/button";
import { EvidenceLinks } from "./EvidenceLinks";
import type { SourceById } from "./shared";

interface RecommendedIdeasSectionProps {
  run: CompetitorIntelligenceRun;
  sourceById: SourceById;
  onIdeaSelected?: (
    idea: CompetitorIntelligenceIdea,
    run: CompetitorIntelligenceRun,
  ) => Promise<boolean>;
}

export function RecommendedIdeasSection({ run, sourceById, onIdeaSelected }: RecommendedIdeasSectionProps) {
  const [promoting, setPromoting] = useState<string | null>(null);

  async function promote(idea: CompetitorIntelligenceIdea) {
    if (!onIdeaSelected || promoting) return;
    const key = `${idea.channel}:${idea.title}`;
    setPromoting(key);
    try {
      await onIdeaSelected(idea, run);
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {run.analysis.recommended_ideas.map((idea) => {
        const ideaKey = `${idea.channel}:${idea.title}`;
        return (
        <div key={ideaKey} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
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
          <EvidenceLinks ids={idea.source_item_ids} quotes={idea.evidence_quotes} sourceById={sourceById} />
          {onIdeaSelected && (
            <div className="mt-4 flex justify-end">
              <Button type="button" size="sm" disabled={Boolean(promoting)} onClick={() => void promote(idea)}>
                {promoting === ideaKey ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                {promoting === ideaKey ? "Creating brief…" : "Build content brief"}
              </Button>
            </div>
          )}
        </div>
      );})}
    </div>
  );
}
