"use client";

import { memo, useCallback, useState } from "react";
import { RefreshCw, Wand2, Lightbulb, SquareCheckBig, Square, BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiSuggestion } from "@/types/content";
import { TYPE_ICON_COLORS, TYPE_ICONS } from "@/types/content";

interface AiSuggestionsProps {
  suggestions: AiSuggestion[] | null;
  isGenerating: boolean;
  isSubmitting: boolean;
  onGenerate: () => Promise<void>;
  onSubmitSelected: (selected: AiSuggestion[]) => Promise<void>;
  onClose: () => void;
}

// Individual suggestion card
const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  isSelected,
  onToggle,
  index,
}: {
  suggestion: AiSuggestion;
  isSelected: boolean;
  onToggle: (index: number) => void;
  index: number;
}) {
  const TypeIcon = TYPE_ICONS[suggestion.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[suggestion.content_type] || "text-zinc-400";

  const handleClick = useCallback(() => {
    onToggle(index);
  }, [onToggle, index]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-left p-4 rounded-xl border transition-colors ${
        isSelected
          ? "border-purple-500/60 bg-purple-500/10"
          : "border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isSelected ? (
            <SquareCheckBig className="w-4 h-4 text-purple-400" />
          ) : (
            <Square className="w-4 h-4 text-zinc-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
            <span className="text-xs text-zinc-500 capitalize">
              {suggestion.content_type}
            </span>
          </div>
          <p className="text-sm font-semibold text-white leading-snug mb-1">
            {suggestion.title}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
            {suggestion.description}
          </p>
          {suggestion.rationale && (
            <p className="text-xs text-zinc-600 mt-1.5 italic line-clamp-1">
              💡 {suggestion.rationale}
            </p>
          )}
        </div>
      </div>
    </button>
  );
});

export const AiSuggestions = memo(function AiSuggestions({
  suggestions,
  isGenerating,
  isSubmitting,
  onGenerate,
  onSubmitSelected,
  onClose,
}: AiSuggestionsProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const handleToggle = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!suggestions) return;
    const selected = suggestions.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    await onSubmitSelected(selected);
    setSelectedIndices(new Set());
  }, [suggestions, selectedIndices, onSubmitSelected]);

  const handleClose = useCallback(() => {
    setSelectedIndices(new Set());
    onClose();
  }, [onClose]);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-800/60">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-400" />
          <p className="text-sm font-semibold text-white">AI-Generated Topic Ideas</p>
          <span className="text-xs text-zinc-500">from your Vault + Company DNA</span>
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
          <p className="text-zinc-400 text-sm">Analyzing your Vault and generating ideas…</p>
        </div>
      ) : suggestions?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Lightbulb className="w-8 h-8 text-zinc-700 mb-2" />
          <p className="text-zinc-500 text-sm">No topic ideas returned. Try regenerating.</p>
        </div>
      ) : (
        <>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions?.map((suggestion, index) => (
              <SuggestionCard
                key={`${suggestion.content_type}-${suggestion.title.slice(0, 30)}`}
                suggestion={suggestion}
                isSelected={selectedIndices.has(index)}
                onToggle={handleToggle}
                index={index}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-800/40">
            <p className="text-xs text-zinc-500">
              {selectedIndices.size} of {suggestions?.length || 0} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onGenerate}
                disabled={isGenerating}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || selectedIndices.size === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSubmitting
                  ? "Adding…"
                  : `Add ${selectedIndices.size > 0 ? selectedIndices.size : ""} Topic${
                      selectedIndices.size !== 1 ? "s" : ""
                    }`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
