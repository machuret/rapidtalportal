"use client";

import { useState } from "react";
import { Check, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { useBrainSignal } from "@/hooks/useBrainSignal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const POSITIVE = [
  "Accurate and relevant",
  "Understood the business",
  "Useful next steps",
  "Good explanation",
  "Right tone",
] as const;

const NEGATIVE = [
  "Incorrect company fact",
  "Outdated guidance",
  "Missing information",
  "Not relevant",
  "Too vague",
  "Wrong role or audience",
  "Wrong tone",
  "Other",
] as const;

const DIMENSIONS: Record<string, string[]> = {
  "Accurate and relevant": ["claims", "topic"],
  "Understood the business": ["audience", "useful_detail"],
  "Useful next steps": ["cta", "useful_detail"],
  "Good explanation": ["structure", "useful_detail"],
  "Right tone": ["voice"],
  "Incorrect company fact": ["claims"],
  "Outdated guidance": ["claims"],
  "Missing information": ["useful_detail"],
  "Not relevant": ["topic"],
  "Too vague": ["useful_detail"],
  "Wrong role or audience": ["audience"],
  "Wrong tone": ["voice"],
  Other: [],
};

export function CoachFeedback({
  clientId,
  question,
  answer,
  snapshotId,
  coachRole,
  sources,
}: {
  clientId: string;
  question: string;
  answer: string;
  snapshotId?: string | null;
  coachRole: "client" | "va";
  sources: Array<{ kind: string; title: string; itemId: string | null }>;
}) {
  const { sendSignal, isSending } = useBrainSignal();
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (rating === null || !reason || done || isSending) return;
    try {
      await sendSignal({
        client_id: clientId,
        surface: "vault_answer",
        artifact_id: snapshotId ?? null,
        artifact_text: answer.slice(0, 8_000),
        rating,
        reason: [reason, detail.trim()].filter(Boolean).join(" — "),
        dimensions: DIMENSIONS[reason] ?? [],
        context: {
          visibility: "private_coach",
          question: question.slice(0, 2_000),
          brainContextSnapshotId: snapshotId ?? null,
          coachRole,
          sources: sources.slice(0, 20),
          learningPolicy: "review_required_no_automatic_company_truth",
        },
      });
      setDone(true);
      setRating(null);
      toast.success("Feedback saved for governed Brain learning review.");
    } catch {
      // The shared API client reports the recoverable error and keeps this open.
    }
  }

  if (done) {
    return <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Check className="h-3.5 w-3.5 text-green-400" /> Feedback saved</span>;
  }

  const choices = rating === 1 ? POSITIVE : NEGATIVE;
  return (
    <div className="relative ml-auto inline-flex items-center gap-1">
      <button type="button" onClick={() => { setRating(1); setReason(null); }} disabled={isSending}
        aria-label="Give positive Coach feedback" title="Good answer"
        className="rounded p-1 text-zinc-500 transition-colors hover:text-green-400 disabled:opacity-40">
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => { setRating(-1); setReason(null); }} disabled={isSending}
        aria-label="Give negative Coach feedback" title="Answer needs work"
        className="rounded p-1 text-zinc-500 transition-colors hover:text-red-400 disabled:opacity-40">
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {rating !== null && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(25rem,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-left shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{rating === 1 ? "What worked?" : "What should change?"}</p>
              <p className="mt-0.5 text-xs text-zinc-500">Feedback improves retrieval and enters review. It never becomes company truth automatically.</p>
            </div>
            <button type="button" aria-label="Close Coach feedback" onClick={() => setRating(null)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button key={choice} type="button" aria-pressed={reason === choice} onClick={() => setReason(choice)}
                className={`rounded-full border px-2.5 py-1 text-xs ${reason === choice ? "border-purple-400 bg-purple-500/15 text-purple-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {choice}
              </button>
            ))}
          </div>
          <Textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={1_500} rows={3}
            placeholder={rating === -1 ? "What was wrong, and what should the Coach use instead?" : "Optional detail"}
            aria-label="Optional Coach feedback detail" className="mt-3 bg-zinc-900 text-sm" />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRating(null)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!reason || isSending} onClick={submit}>Save feedback</Button>
          </div>
        </div>
      )}
    </div>
  );
}
