"use client";

import { memo, useCallback, useState } from "react";
import { RefreshCw, Wand2, Lightbulb, SquareCheckBig, Square, BookText, ThumbsUp, ThumbsDown, AlertTriangle, Info } from "lucide-react";
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
  if (typeof why.fit === "number") s += ` · fit ${why.fit}/100`;
  return s + ".";
}

interface AiSuggestionsProps {
  clientId: string;
  suggestions: AiSuggestion[] | null;
  isGenerating: boolean;
  isSubmitting: boolean;
  onGenerate: () => Promise<void>;
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
  index,
}: {
  suggestion: AiSuggestion;
  isSelected: boolean;
  onToggle: (index: number) => void;
  onLike: (index: number) => void;
  onFlag: (index: number) => void;
  busy: boolean;
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
      <button type="button" onClick={() => onToggle(index)} className="w-full text-left p-4">
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
                  <AlertTriangle className="w-3 h-3" /> AI: low fit{typeof suggestion.fit === "number" ? ` (${suggestion.fit})` : ""}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-white leading-snug mb-1">{suggestion.title}</p>
            <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{suggestion.description}</p>
            {suggestion.rationale && (
              <p className="text-xs text-zinc-600 mt-1.5 italic line-clamp-1">💡 {suggestion.rationale}</p>
            )}
            {whySentence(suggestion.why) && (
              <p className="text-xs text-orange-400/80 mt-1.5 flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" /> <span>{whySentence(suggestion.why)}</span>
              </p>
            )}
          </div>
        </div>
      </button>
      {/* Teach the Brain */}
      <div className="flex items-center justify-end gap-1 px-4 pb-2.5 -mt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onLike(index)}
          title="Good suggestion"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-green-400 px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-40"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
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
  onGenerate,
  onSubmitSelected,
  onClose,
}: AiSuggestionsProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const { sendSignal, isSending } = useBrainSignal();

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
      await signalFor(s, 1);
      toast.success("Noted — the Brain will favour ideas like this.");
    },
    [suggestions, signalFor]
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
          <p className="text-sm font-semibold text-white">AI-Generated Topic Ideas</p>
          <span className="text-xs text-zinc-500">from your Company Brain</span>
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
        <div className="flex items-center justify-center gap-3 py-12">
          <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
          <p className="text-zinc-400 text-sm">Analyzing your Brain and generating ideas…</p>
        </div>
      ) : visibleCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Lightbulb className="w-8 h-8 text-zinc-700 mb-2" />
          <p className="text-zinc-500 text-sm">No topic ideas to show. Try regenerating.</p>
        </div>
      ) : (
        <>
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
                  busy={isSending}
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
                {isSubmitting ? "Adding…" : `Add ${selectedIndices.size > 0 ? selectedIndices.size : ""} Topic${selectedIndices.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
