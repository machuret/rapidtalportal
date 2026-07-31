"use client";

import { useMemo, useState } from "react";
import { ThumbsUp, ThumbsDown, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useBrainSignal, type BrainSignalInput } from "@/hooks/useBrainSignal";
import {
  dimensionsForFeedbackReason,
  NEGATIVE_FEEDBACK_REASONS,
  POSITIVE_FEEDBACK_REASONS,
} from "@/lib/brain/editorial-learning";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Structured, dimension-specific feedback for every AI surface. Nothing becomes
 * permanent memory here: the signal enters the reviewed Brain-learning flow.
 */
export function BrainFeedback({
  clientId,
  surface,
  artifactText,
  artifactId = null,
  context = {},
  className = "",
}: {
  clientId: string;
  surface: BrainSignalInput["surface"];
  artifactText: string;
  artifactId?: string | null;
  context?: Record<string, unknown>;
  className?: string;
}) {
  const { sendSignal, isSending } = useBrainSignal();
  const [done, setDone] = useState<null | "up" | "down">(null);
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [commentary, setCommentary] = useState("");

  const reasons = rating === 1 ? POSITIVE_FEEDBACK_REASONS : NEGATIVE_FEEDBACK_REASONS;
  const dimensions = useMemo(
    () => Array.from(new Set(selectedReasons.flatMap(dimensionsForFeedbackReason))),
    [selectedReasons],
  );

  function open(nextRating: 1 | -1) {
    if (isSending || done) return;
    setRating(nextRating);
    setSelectedReasons([]);
    setCommentary("");
  }

  function toggleReason(reason: string) {
    setSelectedReasons((current) =>
      current.includes(reason)
        ? current.filter((entry) => entry !== reason)
        : [...current, reason],
    );
  }

  async function submit() {
    if (isSending || done || rating === null || selectedReasons.length === 0) return;
    const reason = [
      selectedReasons.join(", "),
      commentary.trim(),
    ].filter(Boolean).join(" — ");
    const channel = typeof context.channel === "string"
      ? context.channel
      : typeof context.platform === "string"
        ? context.platform
        : null;
    const contentType = typeof context.contentType === "string"
      ? context.contentType
      : typeof context.content_type === "string"
        ? context.content_type
        : null;
    try {
      await sendSignal({
        client_id: clientId,
        surface,
        artifact_id: artifactId,
        artifact_text: artifactText.slice(0, 8000),
        rating,
        reason,
        dimensions,
        channel: ["linkedin", "facebook", "instagram", "email", "blog", "newsletter"].includes(channel ?? "")
          ? channel
          : null,
        content_type: contentType,
        context,
      });
    } catch {
      return; // api-client already toasted; leave the control active to retry
    }
    setDone(rating === 1 ? "up" : "down");
    setRating(null);
    toast.success("Feedback saved for Brain learning review.");
  }

  if (done) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-zinc-500 ${className}`}>
        <Check className="w-3.5 h-3.5 text-green-400" /> Thanks
      </span>
    );
  }

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => open(1)}
        disabled={isSending}
        aria-label="Give positive feedback"
        title="Good — give specific feedback"
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-green-400 disabled:opacity-40"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => open(-1)}
        disabled={isSending}
        aria-label="Give negative feedback"
        title="Not right — give specific feedback"
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {rating !== null && (
        <div className="absolute right-0 top-full z-50 mt-2 block w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-left shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">
              {rating === 1 ? "What worked?" : "What should change?"}
            </p>
            <button
              type="button"
              aria-label="Close feedback"
              onClick={() => setRating(null)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <button
                key={reason}
                type="button"
                aria-pressed={selectedReasons.includes(reason)}
                onClick={() => toggleReason(reason)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  selectedReasons.includes(reason)
                    ? "border-purple-400 bg-purple-500/15 text-purple-200"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
          <Textarea
            value={commentary}
            onChange={(event) => setCommentary(event.target.value)}
            maxLength={1500}
            rows={3}
            placeholder="Optional detail"
            aria-label="Optional feedback detail"
            className="mt-3 bg-zinc-900 text-sm"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRating(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSending || selectedReasons.length === 0}
              onClick={submit}
            >
              Save feedback
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
