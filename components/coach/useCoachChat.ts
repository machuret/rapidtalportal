"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { type AskSourceKind } from "@/components/intelligence/AskBrainFlow";

export interface Source {
  n: number;
  kind: AskSourceKind;
  kindLabel: string;
  title: string;
  itemId: string | null;
  sourceUrl: string | null;
  versionId: string | null;
  versionNumber: number | null;
  chunkId: string | null;
  category: string | null;
}

export type CoachRole = "client" | "va";
export type CoachMode = "private" | "message_client" | "message_va_team" | "create_task" | "update_task" | "submit_review" | "review_task" | "create_goal" | "create_commitment" | "create_memory";

export interface CoachTeamMember {
  id: string;
  name: string;
}
export interface CoachTaskOption { id: string; title: string; status: "todo" | "in_progress" | "review" | "done" }

export type LibraryAvailability = "available" | "degraded" | "unavailable" | "not_requested";
export type ContextWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "blocking";
};

interface AskResponse {
  answer: string;
  sources: Source[];
  chunksUsed: number;
  tokensUsed?: number;
  brainContextSnapshotId?: string | null;
  libraryAvailability: LibraryAvailability;
  warnings: ContextWarning[];
  suggestions: string[];
  actionDraft?: CoachActionDraft | null;
}

export type CoachActionDraft =
  | { type: "create_task"; idempotencyKey: string; title: string; brief: string; assigneeId: string | null; priority: 1 | 2 | 3 | 4; dueDate: string | null }
  | { type: "send_message"; idempotencyKey: string; audience: "client" | "va_team"; message: string }
  | { type: "update_task"; idempotencyKey: string; taskId: string; status: "todo" | "in_progress" | "review" | "done"; priority: 1 | 2 | 3 | 4; dueDate: string | null; note: string }
  | { type: "submit_review"; idempotencyKey: string; taskId: string; note: string }
  | { type: "review_task"; idempotencyKey: string; taskId: string; decision: "approve" | "changes"; note: string }
  | { type: "create_goal"; idempotencyKey: string; title: string; outcome: string; targetDate: string | null }
  | { type: "create_commitment"; idempotencyKey: string; commitment: string; goalId: string | null; dueDate: string | null; checkInDate: string | null }
  | { type: "create_memory"; idempotencyKey: string; kind: "preference" | "decision" | "context" | "challenge"; content: string };

export interface Turn {
  question: string;
  answer: string;
  sources: Source[];
  brainContextSnapshotId?: string | null;
  libraryAvailability: LibraryAvailability;
  warnings: ContextWarning[];
  suggestions: string[];
  queriedKinds: AskSourceKind[];
  coachMode: CoachMode;
  actionDraft?: CoachActionDraft | null;
  actionStatus?: "none" | "draft" | "processing" | "completed" | "failed";
}

export type AnswerEvidence = Pick<
  Turn,
  "sources" | "brainContextSnapshotId" | "libraryAvailability" | "warnings" | "suggestions"
>;

export type HistoryItem = { question: string; answer: string };

const DEFAULT_QUERIED_KINDS: AskSourceKind[] = ["dna", "vault", "operation", "library", "memory"];

function queriedKinds(question: string): AskSourceKind[] {
  return /\b(competitor|competition|market|industry|rival|benchmark)\b/iu.test(question)
    ? [...DEFAULT_QUERIED_KINDS, "market"]
    : DEFAULT_QUERIED_KINDS;
}

function inferredCoachMode(
  question: string,
  role: CoachRole,
  selected: CoachMode,
): CoachMode {
  if (selected !== "private") return selected;
  if (/\b(?:remember|keep in mind|don't forget|note that)\b/iu.test(question)) return "create_memory";
  if (/\b(?:track|save|remember|set|make|create)\b.{0,50}\bgoal\b/iu.test(question)) return "create_goal";
  if (/\b(?:commit|commitment|hold me accountable|check in)\b/iu.test(question)) return "create_commitment";
  if (role === "client" && /\b(?:create|assign|give|make)\b.{0,50}\btask\b/iu.test(question)) {
    return "create_task";
  }
  if (role === "client" && /\b(?:approve|request changes|send back|review)\b/iu.test(question)) return "review_task";
  if (role === "va" && /\b(?:submit|ready)\b.{0,50}\breview\b/iu.test(question)) return "submit_review";
  if (/\b(?:update|change|move)\b.{0,50}\btask\b/iu.test(question)) return "update_task";
  if (role === "client" && /\b(?:send|tell|message|ask)\b.{0,60}\b(?:va|team)\b/iu.test(question)) {
    return "message_va_team";
  }
  if (role === "va" && /\b(?:send|tell|message|ask|clarif)\w*\b.{0,60}\bclient\b/iu.test(question)) {
    return "message_client";
  }
  return "private";
}

function decodeHeader<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value)))) as T;
  } catch {
    return fallback;
  }
}

/**
 * Stream an answer from /api/vault/ask-stream (SSE). Calls onProgress with the
 * growing answer. Returns { ok:false } on any failure so the caller can fall
 * back to the non-streaming endpoint — streaming is pure upside, never a break.
 *
 * Pass an AbortSignal and abort it on unmount (or when superseded): without it
 * the connection and its paid LLM stream keep running after the page is gone.
 * When the result has aborted:true the caller must NOT fall back — the abort
 * was deliberate, and the fallback would be a second paid call nobody sees.
 */
async function askStream(
  clientId: string,
  question: string,
  history: HistoryItem[],
  onProgress: (answer: string, sources: Source[]) => void,
  mode?: "deep",
  coachMode: CoachMode = "private",
  signal?: AbortSignal,
): Promise<{
  ok: boolean;
  aborted: boolean;
  answer: string;
  sources: Source[];
  brainContextSnapshotId: string | null;
  libraryAvailability: LibraryAvailability;
  warnings: ContextWarning[];
  suggestions: string[];
  error: string | null;
  recoverable: boolean;
}> {
  let answer = "";
  let sources: Source[] = [];
  try {
    const res = await fetch("/api/vault/ask-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, question, history, coachMode, ...(mode ? { mode } : {}) }),
      signal,
    });
    if (!res.ok || !res.body) {
      let message = "The Brain could not complete that answer.";
      let recoverable = res.status >= 500;
      try {
        const body = await res.json() as { error?: string; recoverable?: boolean };
        message = body.error ?? message;
        recoverable = body.recoverable ?? recoverable;
      } catch { /* response was not JSON */ }
      return {
        ok: false,
        aborted: false,
        answer: "",
        sources: [],
        brainContextSnapshotId: null,
        libraryAvailability: "not_requested",
        warnings: [],
        suggestions: [],
        error: message,
        recoverable,
      };
    }
    const brainContextSnapshotId = res.headers.get("X-Brain-Context-Snapshot") || null;
    const libraryAvailability = (res.headers.get("X-Brain-Library-Availability") || "not_requested") as LibraryAvailability;
    const warnings = decodeHeader<ContextWarning[]>(res.headers.get("X-Brain-Warnings"), []);
    const suggestions = decodeHeader<string[]>(res.headers.get("X-Brain-Suggestions"), []);

    const sh = res.headers.get("X-Vault-Sources");
    sources = decodeHeader<Source[]>(sh, []);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (d === "[DONE]") continue;
        try {
          const delta = JSON.parse(d)?.choices?.[0]?.delta?.content;
          if (delta) { answer += delta; onProgress(answer, sources); }
        } catch { /* partial JSON line; ignore */ }
      }
    }
    return {
      ok: answer.length > 0,
      aborted: false,
      answer,
      sources,
      brainContextSnapshotId,
      libraryAvailability,
      warnings,
      suggestions,
      error: answer.length ? null : "The Brain returned an empty answer.",
      recoverable: true,
    };
  } catch {
    return {
      ok: false,
      aborted: signal?.aborted ?? false,
      answer: "",
      sources: [],
      brainContextSnapshotId: null,
      libraryAvailability: "not_requested",
      warnings: [],
      suggestions: [],
      error: "The Brain connection was interrupted.",
      recoverable: true,
    };
  }
}

/** The completed-turn shape, built once — ask() used to duplicate this literal
 * field-for-field at its three exit paths (action preview, stream, fallback). */
function buildCompletedTurn(
  question: string,
  coachMode: CoachMode,
  queriedLayers: AskSourceKind[],
  result: {
    answer: string;
    sources?: Source[];
    brainContextSnapshotId?: string | null;
    libraryAvailability?: LibraryAvailability;
    warnings?: ContextWarning[];
    suggestions?: string[];
    actionDraft?: CoachActionDraft | null;
    actionStatus?: Turn["actionStatus"];
  },
): Turn {
  return {
    question,
    coachMode,
    queriedKinds: queriedLayers,
    answer: result.answer,
    sources: result.sources ?? [],
    brainContextSnapshotId: result.brainContextSnapshotId ?? null,
    libraryAvailability: result.libraryAvailability ?? "not_requested",
    warnings: result.warnings ?? [],
    suggestions: result.suggestions ?? [],
    actionDraft: result.actionDraft ?? null,
    actionStatus: result.actionStatus ?? "none",
  };
}

/** Transport + state engine behind the Coach chat (`AskVaultClient` shell). */
export function useCoachChat({
  clientId,
  coachRole = "client",
  actionsEnabled = true,
  persistConversation = true,
  externalAsk,
}: {
  clientId: string;
  coachRole?: CoachRole;
  actionsEnabled?: boolean;
  persistConversation?: boolean;
  /** Lets a parent (e.g. golden questions panel) submit a question into this chat. */
  externalAsk?: { q: string; nonce: number } | null;
}) {
  const [question, setQuestion] = useState("");
  const [coachMode, setCoachMode] = useState<CoachMode>("private");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(persistConversation);
  const [loading, setLoading] = useState(false);
  const [interim, setInterim] = useState<Turn | null>(null);
  const [askFailure, setAskFailure] = useState<{ question: string; message: string; recoverable: boolean } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!persistConversation) {
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    void api.get<{
      thread: { id: string } | null;
      turns: Array<{
        question: string;
        answer: string;
        coach_mode: CoachMode;
        brain_context_snapshot_id: string;
        sources: Source[];
        suggestions: string[];
        library_availability: LibraryAvailability;
        warnings: ContextWarning[];
        action_draft: CoachActionDraft | null;
        action_status: Turn["actionStatus"];
      }>;
    }>(ROUTES.coach.threadsForClient(clientId), { showErrorToast: false })
      .then((result) => {
        if (cancelled) return;
        setThreadId(result.thread?.id ?? null);
        setTurns((result.turns ?? []).map((turn) => ({
          question: turn.question,
          answer: turn.answer,
          coachMode: turn.coach_mode,
          brainContextSnapshotId: turn.brain_context_snapshot_id,
          sources: turn.sources ?? [],
          suggestions: turn.suggestions ?? [],
          libraryAvailability: turn.library_availability ?? "not_requested",
          warnings: turn.warnings ?? [],
          actionDraft: turn.action_draft ?? null,
          actionStatus: turn.action_status ?? "none",
          queriedKinds: [...new Set((turn.sources ?? []).map((source) => source.kind))],
        })));
      })
      .catch(() => { /* A new or temporarily unavailable history never blocks Coach. */ })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, persistConversation]);

  async function persistTurn(turn: Turn) {
    if (!persistConversation || !turn.brainContextSnapshotId) return false;
    try {
      const result = await api.post<{ threadId: string }>(ROUTES.coach.threads(), {
        clientId,
        threadId,
        question: turn.question,
        answer: turn.answer,
        snapshotId: turn.brainContextSnapshotId,
        coachMode: turn.coachMode,
        sources: turn.sources,
        suggestions: turn.suggestions,
        libraryAvailability: turn.libraryAvailability,
        warnings: turn.warnings,
        actionDraft: turn.actionDraft ?? null,
      }, { showErrorToast: false, idempotent: true });
      setThreadId(result.threadId);
      return true;
    } catch {
      toast.error("The answer is available, but Coach history could not be saved yet.");
      return false;
    }
  }

  async function newConversation() {
    if (loading) return;
    if (threadId) {
      try {
        await api.delete(ROUTES.coach.threads(), { clientId, threadId }, { showErrorToast: false });
      } catch {
        toast.error("The current Coach conversation could not be archived.");
        return;
      }
    }
    setThreadId(null);
    setTurns([]);
    setCoachMode("private");
  }

  // A parent panel (golden questions) can push a question into the chat.
  useEffect(() => {
    if (externalAsk?.q) void ask(externalAsk.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAsk?.nonce]);

  async function ask(q: string, requestedMode: CoachMode = coachMode) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || loading) return;
    setQuestion("");
    setLoading(true);
    setAskFailure(null);
    const history: HistoryItem[] = turns.slice(-4).map((t) => ({ question: t.question, answer: t.answer }));
    const requestedLayers = queriedKinds(trimmed);
    let resolvedMode = actionsEnabled
      ? inferredCoachMode(trimmed, coachRole, requestedMode)
      : "private";
    // Show the searching bubble immediately — the router call below used to
    // run first, leaving a dead pause on every unrouted question.
    setInterim({
      question: trimmed,
      answer: "",
      sources: [],
      brainContextSnapshotId: null,
      libraryAvailability: "not_requested",
      warnings: [],
      suggestions: [],
      queriedKinds: requestedLayers,
      coachMode: resolvedMode,
    });
    // Regex stayed silent — ask the LLM router before defaulting to private.
    // Advisory only: the edge function re-enforces role gates downstream.
    if (actionsEnabled && requestedMode === "private" && resolvedMode === "private") {
      try {
        const routed = await api.post<{ mode: CoachMode }>(
          ROUTES.coach.routeMode(),
          { clientId, question: trimmed, coachRole },
          { showErrorToast: false },
        );
        if (routed.mode && routed.mode !== "private") {
          resolvedMode = routed.mode;
          setInterim((current) => current ? { ...current, coachMode: resolvedMode } : null);
        }
      } catch { /* router failure never blocks a private answer */ }
    }

    // Action requests use strict JSON-schema output. Keeping them off the SSE
    // path means the UI never has to infer an executable action from prose.
    if (resolvedMode !== "private") {
      try {
        const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
          clientId, question: trimmed, history, coachMode: resolvedMode,
        }, { showErrorToast: false });
        if (!res.actionDraft) throw new Error("Coach returned no validated action preview.");
        const completedTurn = buildCompletedTurn(trimmed, resolvedMode, requestedLayers, {
          answer: res.answer,
          sources: res.sources,
          brainContextSnapshotId: res.brainContextSnapshotId,
          libraryAvailability: res.libraryAvailability,
          warnings: res.warnings,
          suggestions: res.suggestions,
          actionDraft: res.actionDraft,
          actionStatus: "draft",
        });
        if (!(await persistTurn(completedTurn))) {
          throw new Error("The verified preview could not be saved for safe execution.");
        }
        setTurns((prev) => [...prev, completedTurn]);
      } catch (error) {
        setAskFailure({
          question: trimmed,
          message: errorMessage(error, "The Coach could not prepare a safe action preview."),
          recoverable: true,
        });
      }
      setInterim(null);
      setLoading(false);
      return;
    }

    // Stream first; fall back to the non-streaming endpoint if anything fails.
    streamAbortRef.current?.abort();
    const streamAbort = new AbortController();
    streamAbortRef.current = streamAbort;
    const r = await askStream(clientId, trimmed, history, (answer, sources) =>
      setInterim((current) => current ? { ...current, answer, sources } : null),
      undefined,
      resolvedMode,
      streamAbort.signal,
    );
    // Deliberately aborted (unmount or superseded) — never fall back to a
    // second paid call, and don't touch state on a dead component.
    if (r.aborted) return;
    if (r.ok) {
      const completedTurn = buildCompletedTurn(trimmed, resolvedMode, requestedLayers, {
        answer: r.answer,
        sources: r.sources,
        brainContextSnapshotId: r.brainContextSnapshotId,
        libraryAvailability: r.libraryAvailability,
        warnings: r.warnings,
        suggestions: r.suggestions,
        actionDraft: null,
        actionStatus: "none",
      });
      setTurns((prev) => [...prev, completedTurn]);
      void persistTurn(completedTurn);
    } else {
      try {
        const res = await api.post<AskResponse>(
          ROUTES.vault.ask(),
          { clientId, question: trimmed, history, coachMode: resolvedMode },
          { showErrorToast: false },
        );
        const completedTurn = buildCompletedTurn(trimmed, resolvedMode, requestedLayers, {
          answer: res.answer,
          sources: res.sources,
          brainContextSnapshotId: res.brainContextSnapshotId,
          libraryAvailability: res.libraryAvailability,
          warnings: res.warnings,
          suggestions: res.suggestions,
          actionDraft: res.actionDraft,
          actionStatus: res.actionDraft ? "draft" : "none",
        });
        setTurns((prev) => [...prev, completedTurn]);
        void persistTurn(completedTurn);
      } catch (error) {
        setAskFailure({
          question: trimmed,
          message: errorMessage(
            error,
            r.error ?? "The Brain could not answer that question.",
          ),
          recoverable: r.recoverable,
        });
      }
    }
    setInterim(null);
    setLoading(false);
  }

  /**
   * "Go deeper" transport for one turn. Stream the deep answer so the long
   * (gpt-4o) generation shows progress as it arrives; fall back to the
   * non-streaming endpoint if streaming fails. Returns true when the stream was
   * deliberately aborted — the caller must then skip every state write.
   */
  async function goDeeper(
    turn: Turn,
    history: HistoryItem[],
    signal: AbortSignal,
    onAnswer: (answer: string) => void,
    onEvidence: (evidence: AnswerEvidence) => void,
  ): Promise<boolean> {
    const r = await askStream(clientId, turn.question, history, (a) => onAnswer(a), "deep", turn.coachMode, signal);
    if (r.aborted) return true; // unmounted mid-stream — no fallback, no state writes
    if (r.ok) {
      onEvidence({
        sources: r.sources,
        brainContextSnapshotId: r.brainContextSnapshotId,
        libraryAvailability: r.libraryAvailability,
        warnings: r.warnings,
        suggestions: r.suggestions,
      });
    } else {
      try {
        const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
          clientId,
          question: turn.question,
          mode: "deep",
          history,
          coachMode: turn.coachMode,
        }, { showErrorToast: false });
        onAnswer(res.answer);
        onEvidence({
          sources: res.sources ?? [],
          brainContextSnapshotId: res.brainContextSnapshotId ?? null,
          libraryAvailability: res.libraryAvailability ?? "not_requested",
          warnings: res.warnings ?? [],
          suggestions: res.suggestions ?? [],
        });
      } catch (error) {
        toast.error(errorMessage(error, "The deeper answer could not be generated."));
      }
    }
    return false;
  }

  return {
    question,
    setQuestion,
    coachMode,
    setCoachMode,
    turns,
    threadId,
    historyLoading,
    loading,
    interim,
    askFailure,
    streamAbortRef,
    ask,
    goDeeper,
    newConversation,
    persistTurn,
  };
}
