"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { RefreshCw, Wand2, Lightbulb, SquareCheckBig, Square, BookText, ThumbsUp, ThumbsDown, AlertTriangle, Info, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AiSuggestion } from "@/types/content";
import { TYPE_ICON_COLORS, TYPE_ICONS } from "@/types/content";
import type { BrainWhy } from "@/types/content";
import { useBrainSignal } from "@/hooks/useBrainSignal";

/** Build a plain-English "Why this?" line from the Brain provenance. */
function whySentence(why: BrainWhy | null | undefined): string | null {
  if (!why) return null;
  const parts: string[] = [];
  if (why.profile) parts.push("your company profile");
  if (why.vault) parts.push("your Vault");
  if (why.examples) parts.push(`${why.examples} idea${why.examples === 1 ? "" : "s"} you approved before`);
  if (why.lessons) parts.push(`${why.lessons} learned lesson${why.lessons === 1 ? "" : "s"}`);
  if (parts.length === 0) return null;
  let s = `Built from ${parts.join(", ")}`;
  if (why.grounded) s += " · matched to your acceptance history";
  return s + ".";
}

interface AiSuggestionsProps {
  clientId: string;
  suggestions: AiSuggestion[] | null;
  isGenerating: boolean;
  isSubmitting: boolean;
  warning?: string | null;
  error?: string | null;
  canApprove: boolean;
  mode?: "company" | "competitor_gap";
  onGenerate: () => Promise<void>;
  onSaveApproved: (suggestion: AiSuggestion) => Promise<void>;
  onSubmitSelected: (selected: AiSuggestion[]) => Promise<void>;
  onClose: () => void;
}

// Individual suggestion card. The selection area is a clickable region; the
// 👍/👎 controls are separate real buttons (so the Brain can learn) — hence a
// div container, not a single <button>.
const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  isSelected,
  onToggle,
  onLike,
  onFlag,
  busy,
  saved,
  canApprove,
  index,
}: {
  suggestion: AiSuggestion;
  isSelected: boolean;
  onToggle: (index: number) => void;
  onLike: (index: number) => void;
  onFlag: (index: number) => void;
  busy: boolean;
  saved: boolean;
  canApprove: boolean;
  index: number;
}) {
  const TypeIcon = TYPE_ICONS[suggestion.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[suggestion.content_type] || "text-zinc-400";

  return (
    <div
      className={`rounded-xl border transition-colors ${
        suggestion.ai_flagged
          ? "border-amber-500/40 bg-amber-500/5"
          : isSelected
            ? "border-purple-500/60 bg-purple-500/10"
            : "border-zinc-700 bg-zinc-800/40"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => onToggle(index)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle(index);
          }
        }}
        className="w-full cursor-pointer p-4 text-left"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {isSelected ? <SquareCheckBig className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4 text-zinc-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
              <span className="text-xs text-zinc-500 capitalize">{suggestion.content_type}</span>
              {suggestion.ai_flagged && (
                <span className="inline-flex items-center gap-1 text-2xs font-medium text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Low company relevance — review
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-white leading-snug mb-1">{suggestion.title}</p>
            <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{suggestion.description}</p>
            {suggestion.rationale && (
              <p className="text-xs text-zinc-600 mt-1.5 italic line-clamp-1">Why: {suggestion.rationale}</p>
            )}
            {suggestion.opportunity_type && (
              <p className="mt-1.5 text-xs font-medium capitalize text-orange-300">
                {suggestion.opportunity_type.replace(/_/gu, " ")}
                {suggestion.competitor_evidence?.length
                  ? ` · ${suggestion.competitor_evidence.length} verified source${suggestion.competitor_evidence.length === 1 ? "" : "s"}`
                  : ""}
              </p>
            )}
            {suggestion.evidence_summary && (
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 line-clamp-2">
                Evidence: {suggestion.evidence_summary}
              </p>
            )}
            {whySentence(suggestion.why) && (
              <p className="text-xs text-orange-400/80 mt-1.5 flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" /> <span>{whySentence(suggestion.why)}</span>
              </p>
            )}
            {suggestion.explainability && (
              <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><p className="text-2xs uppercase text-zinc-600">Proposed hook</p><p className="mt-0.5 text-xs text-zinc-300">{suggestion.explainability.hook}</p></div>
                  <div><p className="text-2xs uppercase text-zinc-600">Audience</p><p className="mt-0.5 text-xs text-zinc-300">{suggestion.explainability.intendedAudience}</p></div>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  <span className="text-zinc-600">Why valuable:</span>{" "}
                  {suggestion.explainability.whyValuable}
                </p>
                <details
                  className="mt-3 text-xs text-zinc-400"
                  onClick={(event) => event.stopPropagation()}
                >
                  <summary className="cursor-pointer text-purple-300">Why this idea</summary>
                  <div className="mt-2 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div><p className="text-zinc-600">Company DNA fit</p><p>{suggestion.explainability.companyDnaFit}</p></div>
                      <div><p className="text-zinc-600">Format and CTA</p><p>{suggestion.explainability.recommendedFormat} · {suggestion.explainability.recommendedCta}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                      {Object.entries(suggestion.explainability.scores).map(([key, score]) => (
                        <div key={key} title={score.explanation} className="rounded border border-zinc-800 p-2">
                          <p className="text-2xs capitalize text-zinc-500">{key.replace(/([A-Z])/gu, " $1")}</p>
                          <p className="mt-0.5 text-sm font-semibold text-zinc-200">{score.score}/100</p>
                        </div>
                      ))}
                    </div>
                    <p><span className="text-zinc-600">Existing content difference:</span> {suggestion.explainability.differenceFromExisting}</p>
                    <p><span className="text-zinc-600">Competitor difference:</span> {suggestion.explainability.differenceFromCompetitors}</p>
                    <p>
                      <span className="text-zinc-600">Vault support:</span>{" "}
                      {suggestion.explainability.supportingVaultMaterial.length
                        ? suggestion.explainability.supportingVaultMaterial.map((source) => source.title).join(", ")
                        : "No direct factual support yet"}
                    </p>
                    <p>
                      <span className="text-zinc-600">Market signals:</span>{" "}
                      {suggestion.explainability.supportingMarketSignals.length
                        ? suggestion.explainability.supportingMarketSignals.map((source) => source.competitorName).join(", ")
                        : "None attached"}
                    </p>
                    <p className="text-zinc-500">
                      Confidence: {suggestion.explainability.confidence} · Evidence strength: {suggestion.explainability.evidenceStrength}
                    </p>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Teach the Brain */}
      <div className="flex items-center justify-end gap-1 px-4 pb-2.5 -mt-1">
        <button
          type="button"
          disabled={busy || saved}
          onClick={() => onLike(index)}
          title={saved
            ? canApprove ? "Saved to IDEAS approved" : "Saved for approval"
            : canApprove ? "Save and approve this idea" : "Save this idea for approval"}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-green-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-70"
        >
          {saved ? <Check className="w-3.5 h-3.5 text-green-400" /> : <ThumbsUp className="w-3.5 h-3.5" />}
          {saved ? "Saved" : canApprove ? "Save idea" : "Save for approval"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onFlag(index)}
          title="Doesn't make sense"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-40"
        >
          <ThumbsDown className="w-3.5 h-3.5" /> Doesn&apos;t make sense
        </button>
      </div>
    </div>
  );
});

export const AiSuggestions = memo(function AiSuggestions({
  clientId,
  suggestions,
  isGenerating,
  isSubmitting,
  warning,
  error,
  canApprove,
  mode = "company",
  onGenerate,
  onSaveApproved,
  onSubmitSelected,
  onClose,
}: AiSuggestionsProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [generationSeconds, setGenerationSeconds] = useState(0);
  const { sendSignal, isSending } = useBrainSignal();

  useEffect(() => {
    if (!isGenerating) {
      setGenerationSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setGenerationSeconds(0);
    const timer = window.setInterval(() => {
      setGenerationSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    setSelectedIndices(new Set());
    setDismissed(new Set());
    setSaved(new Set());
  }, [suggestions]);

  const handleToggle = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const signalFor = useCallback(
    (s: AiSuggestion, rating: 1 | -1, reason?: string | null) =>
      sendSignal({
        client_id: clientId,
        surface: "content_topic",
        artifact_text: `${s.title}${s.description ? ` — ${s.description}` : ""}`,
        rating,
        reason: reason ?? null,
        context: { content_type: s.content_type, stage: "suggestion", fit: s.fit ?? null },
      }),
    [sendSignal, clientId]
  );

  const handleLike = useCallback(
    async (index: number) => {
      const s = suggestions?.[index];
      if (!s) return;
      await onSaveApproved(s);
      setSaved((previous) => new Set(previous).add(index));
    },
    [suggestions, onSaveApproved]
  );

  const handleFlag = useCallback(
    async (index: number) => {
      const s = suggestions?.[index];
      if (!s) return;
      const reason = typeof window !== "undefined" ? window.prompt("Why doesn't this make sense? (optional)") : null;
      // null = user cancelled the prompt → abort; empty string = submitted with no reason.
      if (reason === null && typeof window !== "undefined") return;
      await signalFor(s, -1, reason);
      setDismissed((prev) => new Set(prev).add(index));
      setSelectedIndices((prev) => { const n = new Set(prev); n.delete(index); return n; });
      toast.success("Flagged — the Brain will avoid this in future.");
    },
    [suggestions, signalFor]
  );

  const handleSubmit = useCallback(async () => {
    if (!suggestions) return;
    const selected = suggestions.filter((_, i) => selectedIndices.has(i) && !dismissed.has(i));
    if (selected.length === 0) return;
    await onSubmitSelected(selected);
    setSelectedIndices(new Set());
  }, [suggestions, selectedIndices, dismissed, onSubmitSelected]);

  const handleClose = useCallback(() => {
    setSelectedIndices(new Set());
    onClose();
  }, [onClose]);

  const visibleCount = (suggestions?.length ?? 0) - dismissed.size;

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-800/60">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-400" />
          <p className="text-sm font-semibold text-white">
            {mode === "competitor_gap" ? "Competitor-Gap Topic Ideas" : "AI-Generated Topic Ideas"}
          </p>
          <span className="text-xs text-zinc-500">
            {mode === "competitor_gap"
              ? "Company Brain + verified competitor evidence"
              : "from your Company Brain"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-700"
        >
          Close
        </button>
      </div>

      {/* Content */}
      {isGenerating ? (
        <div className="flex items-center justify-center gap-3 py-12" role="status">
          <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
          <div>
            <p className="text-zinc-300 text-sm">
              {mode === "competitor_gap"
                ? "Comparing your company with competitor content…"
                : "Creating four ideas from your Company DNA and Vault…"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Usually 20–45 seconds · {generationSeconds}s elapsed
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-200">Ideas could not be generated</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-400">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onGenerate} disabled={isGenerating}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : visibleCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Lightbulb className="w-8 h-8 text-zinc-700 mb-2" />
          <p className="text-zinc-500 text-sm">No topic ideas to show. Try regenerating.</p>
        </div>
      ) : (
        <>
          {warning && (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions?.map((suggestion, index) =>
              dismissed.has(index) ? null : (
                <SuggestionCard
                  key={`${suggestion.content_type}-${suggestion.title.slice(0, 30)}-${index}`}
                  suggestion={suggestion}
                  isSelected={selectedIndices.has(index)}
                  onToggle={handleToggle}
                  onLike={handleLike}
                  onFlag={handleFlag}
                  busy={isSending || isSubmitting}
                  saved={saved.has(index)}
                  canApprove={canApprove}
                  index={index}
                />
              )
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-800/40">
            <p className="text-xs text-zinc-500">{selectedIndices.size} of {visibleCount} selected</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onGenerate} disabled={isGenerating}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || selectedIndices.size === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSubmitting ? "Saving…" : `Save ${selectedIndices.size > 0 ? selectedIndices.size : ""} Idea${selectedIndices.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
