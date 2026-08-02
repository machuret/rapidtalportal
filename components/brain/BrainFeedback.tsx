"use client";

import { useMemo, useState } from "react";
import { ThumbsUp, ThumbsDown, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useBrainSignal, type BrainSignalInput } from "@/hooks/useBrainSignal";
import {
  COACH_NEGATIVE_FEEDBACK_REASONS,
  COACH_POSITIVE_FEEDBACK_REASONS,
  dimensionsForFeedbackReason,
  NEGATIVE_FEEDBACK_REASONS,
  POSITIVE_FEEDBACK_REASONS,
} from "@/lib/brain/editorial-learning";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface CoachFeedbackSource {
  kind: string;
  title: string;
  itemId: string | null;
  versionId?: string | null;
  versionNumber?: number | null;
}

/**
 * Structured, dimension-specific feedback for every AI surface. Nothing becomes
 * permanent memory here: the signal enters the reviewed Brain-learning flow.
 *
 * `variant="coach"` is the private Coach flavour: the signal is posted with
 * `context.visibility: "private_coach"`, carries the question / snapshot /
 * sources, and its copy makes clear the pattern expires after 30 days and never
 * becomes shared company truth.
 */
export function BrainFeedback({
  clientId,
  surface,
  artifactText,
  artifactId = null,
  context = {},
  className = "",
  variant = "content",
  question = "",
  coachRole,
  sources = [],
}: {
  clientId: string;
  surface: BrainSignalInput["surface"];
  artifactText: string;
  artifactId?: string | null;
  context?: Record<string, unknown>;
  className?: string;
  variant?: "content" | "coach";
  /** coach variant: the question the answer responded to. */
  question?: string;
  /** coach variant: who is asking (client or VA). */
  coachRole?: "client" | "va";
  /** coach variant: citations behind the answer. */
  sources?: CoachFeedbackSource[];
}) {
  const isCoach = variant === "coach";
  const { sendSignal, isSending } = useBrainSignal();
  const [done, setDone] = useState<null | "up" | "down">(null);
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [commentary, setCommentary] = useState("");

  const reasons = rating === 1
    ? (isCoach ? COACH_POSITIVE_FEEDBACK_REASONS : POSITIVE_FEEDBACK_REASONS)
    : (isCoach ? COACH_NEGATIVE_FEEDBACK_REASONS : NEGATIVE_FEEDBACK_REASONS);
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
    setSelectedReasons((current) => {
      // The coach variant records a single reason; content allows multi-select.
      if (isCoach) return current.includes(reason) ? [] : [reason];
      return current.includes(reason)
        ? current.filter((entry) => entry !== reason)
        : [...current, reason];
    });
  }

  async function submit() {
    if (isSending || done || rating === null || selectedReasons.length === 0) return;
    const reason = [
      selectedReasons.join(", "),
      commentary.trim(),
    ].filter(Boolean).join(" — ");
    try {
      if (isCoach) {
        await sendSignal({
          client_id: clientId,
          surface,
          artifact_id: artifactId,
          artifact_text: artifactText.slice(0, 8000),
          rating,
          reason,
          dimensions,
          context: {
            visibility: "private_coach",
            question: question.slice(0, 2_000),
            brainContextSnapshotId: artifactId ?? null,
            coachRole,
            sources: sources.slice(0, 20),
            learningPolicy: "review_required_no_automatic_company_truth",
          },
        });
      } else {
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
      }
    } catch {
      return; // api-client already toasted; leave the control active to retry
    }
    setDone(rating === 1 ? "up" : "down");
    setRating(null);
    toast.success(isCoach
      ? "Feedback saved. Your Coach can use the private pattern for 30 days; it will not become company truth."
      : "Feedback saved for Brain learning review.");
  }

  if (done) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-zinc-500 ${isCoach ? "" : className}`}>
        <Check className={`${isCoach ? "h-3.5 w-3.5" : "w-3.5 h-3.5"} text-green-400`} /> {isCoach ? "Feedback saved" : "Thanks"}
      </span>
    );
  }

  return (
    <div className={`relative ${isCoach ? "ml-auto " : ""}inline-flex items-center gap-1 ${isCoach ? "" : className}`}>
      <button
        type="button"
        onClick={() => open(1)}
        disabled={isSending}
        aria-label={isCoach ? "Give positive Coach feedback" : "Give positive feedback"}
        title={isCoach ? "Good answer" : "Good — give specific feedback"}
        className={isCoach
          ? "rounded p-1 text-zinc-500 transition-colors hover:text-green-400 disabled:opacity-40"
          : "inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-green-400 disabled:opacity-40"}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => open(-1)}
        disabled={isSending}
        aria-label={isCoach ? "Give negative Coach feedback" : "Give negative feedback"}
        title={isCoach ? "Answer needs work" : "Not right — give specific feedback"}
        className={isCoach
          ? "rounded p-1 text-zinc-500 transition-colors hover:text-red-400 disabled:opacity-40"
          : "inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40"}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {rating !== null && (
        <div className={`absolute right-0 top-full z-50 mt-2 ${isCoach ? "" : "block "}w-[min(${isCoach ? "25rem" : "24rem"},calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-left shadow-2xl`}>
          <div className="flex items-center justify-between gap-3">
            {isCoach ? (
              <div>
                <p className="text-sm font-semibold text-white">{rating === 1 ? "What worked?" : "What should change?"}</p>
                <p className="mt-0.5 text-xs text-zinc-500">Your Coach can use the private pattern for 30 days. The question, answer and detail then expire and never become shared company truth.</p>
              </div>
            ) : (
              <p className="text-sm font-semibold text-white">
                {rating === 1 ? "What worked?" : "What should change?"}
              </p>
            )}
            <button
              type="button"
              aria-label={isCoach ? "Close Coach feedback" : "Close feedback"}
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
            placeholder={isCoach && rating === -1 ? "What was wrong, and what should the Coach use instead?" : "Optional detail"}
            aria-label={isCoach ? "Optional Coach feedback detail" : "Optional feedback detail"}
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
