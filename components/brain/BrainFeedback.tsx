"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { toast } from "sonner";
import { useBrainSignal, type BrainSignalInput } from "@/hooks/useBrainSignal";

/**
 * One feedback control for every AI surface. A 👍 / 👎 (👎 asks for an optional
 * reason) that records a brain_signal, so the Brain learns from the whole
 * product — not just content topics. Compact; collapses to a thank-you once given.
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

  async function rate(rating: 1 | -1) {
    if (isSending || done) return;
    const reason =
      rating === -1 && typeof window !== "undefined"
        ? window.prompt("What was off about this? (optional — helps the Brain improve)")
        : null;
    if (rating === -1 && reason === null && typeof window !== "undefined") return; // cancelled
    await sendSignal({
      client_id: clientId,
      surface,
      artifact_id: artifactId,
      artifact_text: artifactText.slice(0, 8000),
      rating,
      reason,
      context,
    });
    setDone(rating === 1 ? "up" : "down");
    toast.success(rating === 1 ? "Glad it helped — the Brain will favour this." : "Noted — the Brain will learn from this.");
  }

  if (done) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-zinc-500 ${className}`}>
        <Check className="w-3.5 h-3.5 text-green-400" /> Thanks
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => rate(1)}
        disabled={isSending}
        title="Good — teach the Brain"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-green-400 px-1.5 py-1 rounded hover:bg-zinc-800 disabled:opacity-40"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => rate(-1)}
        disabled={isSending}
        title="Not right — teach the Brain"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 px-1.5 py-1 rounded hover:bg-zinc-800 disabled:opacity-40"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
