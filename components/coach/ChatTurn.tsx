"use client";

import { memo, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  ExternalLink,
  Flag,
  LibraryBig,
  ListTodo,
  Loader2,
  LockKeyhole,
  MessageSquare,
  RotateCcw,
  Send,
  Square,
  Sparkles,
  Target,
} from "lucide-react";
import { BrainContextUsed } from "@/components/brain/BrainContextUsed";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { ActionDraftFields } from "./ActionDraftForms";
import type {
  AnswerEvidence,
  CoachActionDraft,
  CoachRole,
  CoachTaskOption,
  CoachTeamMember,
  HistoryItem,
  Source,
  Turn,
} from "./useCoachChat";

/** One Q&A exchange — clean answer by default, with optional "Go deeper" + sources. */
export const ChatTurn = memo(function ChatTurn({
  turn, clientId, history, canCurate, coachRole, speakerName,
  teamMembers, actionsEnabled, onAsk, onGoDeeper, onActionComplete,
  taskOptions,
}: {
  turn: Turn;
  clientId: string;
  history: HistoryItem[];
  canCurate: boolean;
  coachRole: CoachRole;
  speakerName: string;
  teamMembers: CoachTeamMember[];
  taskOptions: CoachTaskOption[];
  actionsEnabled: boolean;
  onAsk: (question: string) => Promise<void>;
  onGoDeeper: (
    turn: Turn,
    history: HistoryItem[],
    signal: AbortSignal,
    onAnswer: (answer: string) => void,
    onEvidence: (evidence: AnswerEvidence) => void,
  ) => Promise<boolean>;
  /** Called after a confirmed action executes — the shell resets the composer mode. */
  onActionComplete?: () => void;
}) {
  const [showSources, setShowSources] = useState(true);
  const [deepAnswer, setDeepAnswer] = useState<string | null>(turn.deepAnswer ?? null);
  const [deepEvidence, setDeepEvidence] = useState<AnswerEvidence | null>(turn.deepEvidence ?? null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gapConsentOpen, setGapConsentOpen] = useState(false);
  const [gapSuggesting, setGapSuggesting] = useState(false);
  const [gapSuggested, setGapSuggested] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionComplete, setActionComplete] = useState(turn.actionStatus === "completed");
  const [actionDraft, setActionDraft] = useState<CoachActionDraft | null>(turn.actionDraft ?? null);
  const deepAbortRef = useRef<AbortController | null>(null);

  // Abort an in-flight "Go deeper" stream if this turn unmounts mid-generation.
  useEffect(() => () => deepAbortRef.current?.abort(), []);

  const unanswered = turn.sources.length === 0;

  async function suggestLibraryTopic() {
    if (gapSuggesting || gapSuggested || !turn.brainContextSnapshotId) return;
    setGapSuggesting(true);
    try {
      await api.post(ROUTES.coach.libraryGaps(), {
        clientId,
        snapshotId: turn.brainContextSnapshotId,
        topic: turn.question,
        detail: "No relevant published Business Library guidance was cited for this Coach answer.",
        consent: true,
      }, { showErrorToast: false });
      setGapSuggested(true);
      setGapConsentOpen(false);
      toast.success("Topic shared with the Library team. Your private conversation remains private.");
    } catch (error) {
      toast.error(errorMessage(error, "The Library suggestion could not be shared."));
    } finally {
      setGapSuggesting(false);
    }
  }

  async function goDeeper() {
    if (deepLoading || deepAnswer) return;
    setDeepLoading(true);
    deepAbortRef.current?.abort();
    const deepAbort = new AbortController();
    deepAbortRef.current = deepAbort;
    const completion: { answer: string; evidence: AnswerEvidence | null } = {
      answer: "",
      evidence: null,
    };
    const aborted = await onGoDeeper(
      turn,
      history,
      deepAbort.signal,
      (answer) => {
        completion.answer = answer;
        setDeepAnswer(answer);
      },
      (evidence) => {
        completion.evidence = evidence;
        setDeepEvidence(evidence);
      },
    );
    setDeepLoading(false);
    if (aborted) return;
    if (
      completion.answer && completion.evidence?.brainContextSnapshotId
      && turn.brainContextSnapshotId
    ) {
      try {
        await api.patch(ROUTES.coach.threads(), {
          clientId,
          originalSnapshotId: turn.brainContextSnapshotId,
          deepAnswer: completion.answer,
          deepSnapshotId: completion.evidence.brainContextSnapshotId,
          sources: completion.evidence.sources,
          suggestions: completion.evidence.suggestions,
          libraryAvailability: completion.evidence.libraryAvailability,
          warnings: completion.evidence.warnings,
        }, { showErrorToast: false, idempotent: true });
      } catch {
        toast.error("The deeper answer is visible, but it could not be saved to Coach history yet.");
      }
    }
  }

  async function saveToKb() {
    if (saved || deepLoading) return;
    try {
      await api.post(ROUTES.vault.promoteKb(), {
        clientId, question: turn.question, answer: deepAnswer ?? turn.answer,
      }, { showErrorToast: false });
      setSaved(true);
      toast.success("Saved to the Knowledge Base.");
    } catch (error) {
      toast.error(errorMessage(error, "The answer could not be saved to the Knowledge Base."));
    }
  }

  async function confirmCoachAction() {
    if (actionBusy || actionComplete || turn.coachMode === "private" || !actionDraft || !turn.brainContextSnapshotId) return;
    setActionBusy(true);
    try {
      await api.post(ROUTES.coach.actions(), {
        clientId,
        snapshotId: turn.brainContextSnapshotId,
        action: actionDraft,
      }, { showErrorToast: false, idempotent: true });
      if (actionDraft.type === "create_task") {
        toast.success("Task created. The assigned VA can now see it.");
      } else if (actionDraft.type === "send_message") {
        toast.success(actionDraft.audience === "client"
          ? "Message sent to the client."
          : "Message sent to the VA team.");
      } else if (actionDraft.type === "submit_review") {
        toast.success("Work submitted for client review.");
      } else if (actionDraft.type === "review_task") {
        toast.success(actionDraft.decision === "approve" ? "Work approved." : "Changes requested.");
      } else if (actionDraft.type === "create_goal") {
        toast.success("Goal added to your private coaching plan.");
        window.dispatchEvent(new Event("coach-progress-changed"));
      } else if (actionDraft.type === "create_commitment") {
        toast.success("Commitment saved. The Coach will follow up privately.");
        window.dispatchEvent(new Event("coach-progress-changed"));
      } else if (actionDraft.type === "create_memory") {
        toast.success("Saved to your private Coach memory.");
        window.dispatchEvent(new Event("coach-memory-changed"));
      } else {
        toast.success("Task updated.");
      }
      setActionComplete(true);
      // The mode was consumed — reset the composer to private so the user's
      // next question doesn't silently become another action draft.
      onActionComplete?.();
    } catch (error) {
      toast.error(errorMessage(error, "The Coach action could not be completed."));
    } finally {
      setActionBusy(false);
    }
  }

  const hasLibrarySource = turn.sources.some((source) => source.kind === "library");
  const canSuggestLibraryGap = turn.coachMode === "private"
    && Boolean(turn.brainContextSnapshotId)
    && (turn.libraryAvailability === "available" || turn.libraryAvailability === "degraded")
    && !hasLibrarySource;

  return (
    <div className="space-y-3">
      {/* Question */}
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <p className="mb-1 text-right text-3xs font-medium text-zinc-500">
            {speakerName} — {coachRole === "client" ? "Client" : "VA"}
          </p>
          <div className="rounded-2xl rounded-br-sm bg-orange-500 px-4 py-2.5 text-sm text-zinc-950">
            {turn.question}
          </div>
        </div>
      </div>

      {/* Answer */}
      <div className="surface-card p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-3xs font-semibold uppercase tracking-wide text-purple-300">RapidTal Coach</p>
          <span className="inline-flex items-center gap-1 text-3xs text-zinc-500">
            <LockKeyhole className="h-3 w-3" /> Private until you approve
          </span>
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{turn.answer}</p>

        {turn.warnings.filter((warning) => !warning.code.startsWith("business_library_")).map((warning) => (
          <div key={warning.code} className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-semibold text-amber-200">Context temporarily limited</p>
                <p className="mt-0.5 text-xs leading-5 text-amber-200/70">{warning.message}</p>
              </div>
            </div>
            {warning.code === "coach_progress_unavailable" && (
              <button type="button" onClick={() => void onAsk(turn.question)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200">
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        ))}

        {actionsEnabled && turn.coachMode !== "private" && actionDraft && (
          <div className="mt-4 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
            <div className="flex items-start gap-3">
              {actionDraft.type === "send_message"
                ? <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
                : <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-purple-100">
                  {actionDraft.type === "create_task" ? "Create task preview"
                    : actionDraft.type === "send_message" ? `Message preview — ${actionDraft.audience === "client" ? "Client" : "VA Team"}`
                      : actionDraft.type === "update_task" ? "Task update preview"
                        : actionDraft.type === "submit_review" ? "Review submission preview"
                          : actionDraft.type === "review_task" ? "Client review preview"
                            : actionDraft.type === "create_goal" ? "Private goal preview"
                              : actionDraft.type === "create_commitment" ? "Private commitment preview"
                                : "Private memory preview"}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Nothing has been shared yet. Review the Coach draft, then confirm below.
                </p>
                <ActionDraftFields
                  actionComplete={actionComplete}
                  actionDraft={actionDraft}
                  setActionDraft={setActionDraft}
                  teamMembers={teamMembers}
                  taskOptions={taskOptions}
                  coachRole={coachRole}
                />
                <Button
                  size="sm"
                  onClick={confirmCoachAction}
                  disabled={actionBusy || actionComplete || (actionDraft.type === "create_task" ? !actionDraft.title.trim() || !actionDraft.brief.trim() : actionDraft.type === "send_message" ? !actionDraft.message.trim() : actionDraft.type === "create_goal" ? !actionDraft.title.trim() : actionDraft.type === "create_commitment" ? !actionDraft.commitment.trim() : actionDraft.type === "create_memory" ? actionDraft.content.trim().length < 3 : !actionDraft.taskId)}
                  className="mt-3 gap-1.5"
                >
                  {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionComplete ? <Check className="h-3.5 w-3.5" /> : actionDraft.type === "send_message" ? <Send className="h-3.5 w-3.5" /> : actionDraft.type === "create_goal" ? <Target className="h-3.5 w-3.5" /> : actionDraft.type === "create_commitment" ? <Flag className="h-3.5 w-3.5" /> : actionDraft.type === "create_memory" ? <BookmarkPlus className="h-3.5 w-3.5" /> : <ListTodo className="h-3.5 w-3.5" />}
                  {actionComplete
                    ? "Confirmed"
                    : turn.coachMode === "create_task"
                      ? "Create Task"
                      : turn.coachMode === "message_client"
                        ? "Send to Client"
                        : turn.coachMode === "message_va_team" ? "Send to VA Team" : turn.coachMode === "submit_review" ? "Submit for Review" : turn.coachMode === "review_task" ? "Confirm Review" : turn.coachMode === "create_goal" ? "Track Goal" : turn.coachMode === "create_commitment" ? "Make Commitment" : turn.coachMode === "create_memory" ? "Remember" : "Update Task"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {turn.libraryAvailability === "unavailable" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
            <LibraryBig className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-semibold text-amber-200">Library temporarily unavailable</p>
              <p className="mt-0.5 text-xs leading-5 text-amber-200/70">
                This answer used a saved snapshot of the available company context. You can retry to include Library guidance.
              </p>
              <button
                type="button"
                onClick={() => void onAsk(turn.question)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200"
              >
                <RotateCcw className="h-3 w-3" /> Retry with Library
              </button>
            </div>
          </div>
        )}

        {turn.libraryAvailability === "degraded" && (
          <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
            Library search recovered from published releases. The exact versions used remain recorded in this answer&apos;s snapshot.
          </p>
        )}

        {canSuggestLibraryGap && !gapSuggested && (
          <div className="mt-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
            {!gapConsentOpen ? (
              <button type="button" onClick={() => setGapConsentOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-300 hover:text-orange-200">
                <LibraryBig className="h-3.5 w-3.5" /> Suggest this topic for the Business Library
              </button>
            ) : (
              <div>
                <p className="text-xs font-medium text-orange-100">Share only this question as a Library topic?</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Your answer, private conversation and company context will not be shared. An admin will see the topic and whether it came from a Client or VA.</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void suggestLibraryTopic()} disabled={gapSuggesting} className="gap-1.5">
                    {gapSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} I agree — share topic
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setGapConsentOpen(false)} disabled={gapSuggesting} className="border-zinc-700">Keep private</Button>
                </div>
              </div>
            )}
          </div>
        )}
        {gapSuggested && <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400"><Check className="h-3.5 w-3.5" /> Topic shared by consent; conversation kept private.</p>}

        {deepAnswer && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <p className="label-section mb-1.5">More detail</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {deepAnswer}
              {deepLoading && <span className="ml-0.5 animate-pulse">▍</span>}
            </p>
            {deepLoading && (
              <button
                type="button"
                onClick={() => deepAbortRef.current?.abort()}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
              >
                <Square className="h-3.5 w-3.5 fill-current" /> Stop deeper answer
              </button>
            )}
            {deepEvidence?.libraryAvailability === "unavailable" && (
              <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
                The deeper answer used its own verified company snapshot while the Library was temporarily unavailable.
              </p>
            )}
            {deepEvidence && (
              <>
                <CitationList
                  sources={deepEvidence.sources}
                  label="Citations for the deeper answer"
                />
                <div className="mt-3">
                  <BrainContextUsed
                    clientId={clientId}
                    snapshotId={deepEvidence.brainContextSnapshotId}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          {!deepAnswer && !unanswered && turn.coachMode === "private" && (
            <button
              onClick={goDeeper}
              disabled={deepLoading}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            >
              {deepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {deepLoading ? "Thinking…" : "Go deeper"}
            </button>
          )}
          {turn.sources.length > 0 && (
            <button
              onClick={() => setShowSources((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showSources && "rotate-180")} />
              {showSources ? "Hide citations" : `Citations (${turn.sources.length})`}
            </button>
          )}

          {/* Feedback */}
          <div className="flex items-center gap-1 ml-auto">
            <BrainFeedback
              variant="coach"
              clientId={clientId}
              surface="vault_answer"
              question={turn.question}
              artifactText={deepAnswer ?? turn.answer}
              artifactId={deepEvidence?.brainContextSnapshotId ?? turn.brainContextSnapshotId}
              coachRole={coachRole}
              sources={(deepEvidence?.sources ?? turn.sources).map((source) => ({
                kind: source.kind,
                title: source.title,
                itemId: source.itemId,
                versionId: source.versionId,
                versionNumber: source.versionNumber,
              }))}
            />
            {canCurate && (
              <button
                onClick={saveToKb}
                disabled={saved || deepLoading}
                title="Save this answer to the Knowledge Base"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-400 transition-colors disabled:text-green-400 ml-1"
              >
                {saved ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                {saved ? "Saved" : "Save to KB"}
              </button>
            )}
          </div>
        </div>

        {showSources && turn.sources.length > 0 && (
          <CitationList
            sources={turn.sources}
            label={deepAnswer ? "Citations for the original answer" : "Citations"}
          />
        )}
        <div className="mt-3">
          <BrainContextUsed
            clientId={clientId}
            snapshotId={turn.brainContextSnapshotId}
          />
        </div>

        {turn.suggestions.length > 0 && (
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <p className="text-xs font-medium text-zinc-400">Ask a grounded follow-up</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {turn.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void onAsk(suggestion)}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-orange-500/50 hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

function CitationList({
  sources,
  label,
}: {
  sources: Source[];
  label: string;
}) {
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-zinc-400">{label}</p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <li
            key={`${source.n}:${source.kind}:${source.itemId ?? source.title}:${source.chunkId ?? "whole"}`}
            className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-300"
          >
            <div className="flex items-start gap-2">
              <span className="font-mono text-orange-300">[{source.n}]</span>
              <div className="min-w-0 flex-1">
                <p className="text-3xs uppercase tracking-wide text-zinc-500">{source.kindLabel}</p>
                {source.sourceUrl ? (
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 font-medium text-zinc-200 hover:text-white"
                  >
                    <span className="truncate">{source.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <p className="mt-0.5 truncate font-medium text-zinc-200">{source.title}</p>
                )}
                {source.kind === "library" && source.versionNumber && (
                  <p className="mt-1 text-3xs text-orange-300/70">
                    Version {source.versionNumber} · General guidance, not a company fact
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
