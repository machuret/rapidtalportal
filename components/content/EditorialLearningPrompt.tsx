"use client";

import { useState } from "react";
import { Brain, Check, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";

export interface EditorialLearningSuggestion {
  id: string;
  classification: string;
  proposed_outcome: string;
  dimensions: string[];
  summary: string;
  lesson_content: string;
  explanation: string;
  proposed_scope: Record<string, unknown>;
  confidence: number;
  status: string;
}

export function EditorialLearningPrompt({
  clientId,
  suggestion,
  channel,
  contentType,
  onHandled,
}: {
  clientId: string;
  suggestion: EditorialLearningSuggestion;
  channel: string;
  contentType: string;
  onHandled: () => void;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const factual = ["company_dna_update", "vault_correction"].includes(suggestion.proposed_outcome);
  const channelLabel = channel.replaceAll("_", " ").trim();
  const contentTypeLabel = contentType.replaceAll("_", " ").trim();
  const hasDistinctContentType = Boolean(
    contentTypeLabel && contentTypeLabel.toLocaleLowerCase() !== channelLabel.toLocaleLowerCase(),
  );

  async function respond(action: "use_draft" | "remember_channel" | "remember_content_type" | "review" | "dismiss") {
    if (busyAction) return;
    setBusyAction(action);
    try {
      await api.post(ROUTES.brain.learningInbox(), {
        client_id: clientId,
        id: suggestion.id,
        action,
      });
      toast.success(
        action === "use_draft"
          ? "Kept for this draft only."
          : action === "dismiss"
            ? "Learning suggestion dismissed."
            : factual
              ? "Correction sent to the Brain learning inbox for review."
              : "Lesson sent to the Brain learning inbox. It is not active yet.",
      );
      onHandled();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4" aria-label="Editorial learning suggestion">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-purple-500/15 p-2 text-purple-300">
          {factual ? <FileText className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-purple-100">{suggestion.summary}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{suggestion.explanation}</p>
          {!factual && suggestion.lesson_content && (
            <p className="mt-2 rounded-lg bg-zinc-950/60 px-3 py-2 text-xs text-purple-100">
              Suggested lesson: {suggestion.lesson_content}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestion.dimensions.map((dimension) => (
              <span key={dimension} className="rounded-full bg-zinc-800 px-2 py-0.5 text-2xs text-zinc-400">
                {dimension.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!!busyAction} onClick={() => respond("use_draft")}>
          {busyAction === "use_draft" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Use only for this draft
        </Button>
        {!factual && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!busyAction}
              aria-label={`Remember this lesson for the ${channelLabel} channel`}
              title={`Apply only when creating ${channelLabel} content`}
              onClick={() => respond("remember_channel")}
            >
              Remember on {channelLabel}
            </Button>
            {hasDistinctContentType && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!!busyAction}
                aria-label={`Remember this lesson for ${contentTypeLabel} content on any channel`}
                title={`Apply to ${contentTypeLabel} content wherever it is created`}
                onClick={() => respond("remember_content_type")}
              >
                Remember for {contentTypeLabel}
              </Button>
            )}
          </>
        )}
        <Button type="button" size="sm" disabled={!!busyAction} onClick={() => respond("review")}>
          {busyAction === "review"
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Check className="mr-1.5 h-3.5 w-3.5" />}
          {factual ? "Review correction" : "Review suggested lesson"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!!busyAction} onClick={() => respond("dismiss")}>
          <X className="mr-1.5 h-3.5 w-3.5" /> Dismiss
        </Button>
      </div>
      <p className="mt-3 text-2xs text-zinc-500">
        Channel memory applies only on {channelLabel}. Content-type memory can apply across channels.
        Nothing becomes permanent until a client administrator or super administrator approves it.
      </p>
    </section>
  );
}
