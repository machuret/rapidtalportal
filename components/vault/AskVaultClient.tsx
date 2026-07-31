"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  LibraryBig,
  ListTodo,
  LockKeyhole,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { BrainContextUsed } from "@/components/brain/BrainContextUsed";
import { CoachFeedback } from "@/components/brain/CoachFeedback";
import {
  AskBrainFlow,
  type AskFlowState,
  type AskSourceKind,
} from "@/components/intelligence/AskBrainFlow";

interface Source {
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

type CoachRole = "client" | "va";
type CoachMode = "private" | "message_client" | "message_va_team" | "create_task" | "update_task" | "submit_review" | "review_task";

export interface CoachTeamMember {
  id: string;
  name: string;
}
export interface CoachTaskOption { id: string; title: string; status: "todo" | "in_progress" | "review" | "done" }

type LibraryAvailability = "available" | "degraded" | "unavailable" | "not_requested";
type ContextWarning = {
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

type CoachActionDraft =
  | { type: "create_task"; idempotencyKey: string; title: string; brief: string; assigneeId: string | null; priority: 1 | 2 | 3 | 4; dueDate: string | null }
  | { type: "send_message"; idempotencyKey: string; audience: "client" | "va_team"; message: string }
  | { type: "update_task"; idempotencyKey: string; taskId: string; status: "todo" | "in_progress" | "review" | "done"; priority: 1 | 2 | 3 | 4; dueDate: string | null; note: string }
  | { type: "submit_review"; idempotencyKey: string; taskId: string; note: string }
  | { type: "review_task"; idempotencyKey: string; taskId: string; decision: "approve" | "changes"; note: string };

interface Turn {
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

type AnswerEvidence = Pick<
  Turn,
  "sources" | "brainContextSnapshotId" | "libraryAvailability" | "warnings" | "suggestions"
>;

type HistoryItem = { question: string; answer: string };

const SUGGESTIONS = [
  "What services do we offer, based on our company evidence?",
  "Which SEO basics should our business apply first?",
  "How could we improve our Facebook Ads approach?",
  "What knowledge is missing from our Brain?",
];

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
 */
async function askStream(
  clientId: string,
  question: string,
  history: HistoryItem[],
  onProgress: (answer: string, sources: Source[]) => void,
  mode?: "deep",
  coachMode: CoachMode = "private",
): Promise<{
  ok: boolean;
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

export function AskVaultClient({
  clientId,
  companyName,
  canCurate,
  coachRole = "client",
  speakerName = "You",
  teamMembers = [],
  taskOptions = [],
  actionsEnabled = true,
  persistConversation = true,
  externalAsk,
}: {
  clientId: string;
  companyName: string;
  canCurate: boolean;
  coachRole?: CoachRole;
  speakerName?: string;
  teamMembers?: CoachTeamMember[];
  taskOptions?: CoachTaskOption[];
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, interim]);

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
    const resolvedMode = actionsEnabled
      ? inferredCoachMode(trimmed, coachRole, requestedMode)
      : "private";
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

    // Action requests use strict JSON-schema output. Keeping them off the SSE
    // path means the UI never has to infer an executable action from prose.
    if (resolvedMode !== "private") {
      try {
        const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
          clientId, question: trimmed, history, coachMode: resolvedMode,
        }, { showErrorToast: false });
        if (!res.actionDraft) throw new Error("Coach returned no validated action preview.");
        const completedTurn: Turn = {
          question: trimmed,
          answer: res.answer,
          sources: res.sources ?? [],
          brainContextSnapshotId: res.brainContextSnapshotId ?? null,
          libraryAvailability: res.libraryAvailability ?? "not_requested",
          warnings: res.warnings ?? [],
          suggestions: res.suggestions ?? [],
          queriedKinds: requestedLayers,
          coachMode: resolvedMode,
          actionDraft: res.actionDraft,
          actionStatus: "draft",
        };
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
    const r = await askStream(clientId, trimmed, history, (answer, sources) =>
      setInterim((current) => current ? { ...current, answer, sources } : null),
      undefined,
      resolvedMode,
    );
    if (r.ok) {
      const completedTurn: Turn = {
        question: trimmed,
        answer: r.answer,
        sources: r.sources,
        brainContextSnapshotId: r.brainContextSnapshotId,
        libraryAvailability: r.libraryAvailability,
        warnings: r.warnings,
        suggestions: r.suggestions,
        queriedKinds: requestedLayers,
        coachMode: resolvedMode,
        actionDraft: null,
        actionStatus: "none",
      };
      setTurns((prev) => [...prev, completedTurn]);
      void persistTurn(completedTurn);
    } else {
      try {
        const res = await api.post<AskResponse>(
          ROUTES.vault.ask(),
          { clientId, question: trimmed, history, coachMode: resolvedMode },
          { showErrorToast: false },
        );
        const completedTurn: Turn = {
          question: trimmed,
          answer: res.answer,
          sources: res.sources ?? [],
          brainContextSnapshotId: res.brainContextSnapshotId ?? null,
          libraryAvailability: res.libraryAvailability ?? "not_requested",
          warnings: res.warnings ?? [],
          suggestions: res.suggestions ?? [],
          queriedKinds: requestedLayers,
          coachMode: resolvedMode,
          actionDraft: res.actionDraft ?? null,
          actionStatus: res.actionDraft ? "draft" : "none",
        };
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  const latestTurn = turns.at(-1) ?? null;
  const visibleSources = interim?.sources.length
    ? interim.sources
    : latestTurn?.sources ?? [];
  const flowState: AskFlowState = interim
    ? interim.answer
      ? "answering"
      : "searching"
    : latestTurn
      ? "ready"
      : "idle";
  const visibleQueriedKinds = interim?.queriedKinds
    ?? latestTurn?.queriedKinds
    ?? [];
  const visibleLibraryAvailability = interim?.libraryAvailability
    ?? latestTurn?.libraryAvailability
    ?? "not_requested";

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        {persistConversation && turns.length > 0 && (
          <div className="mb-3 flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={newConversation} disabled={loading} className="gap-1.5 border-zinc-700 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> New conversation
            </Button>
          </div>
        )}
        <AskBrainFlow
          companyName={companyName}
          coachRole={coachRole}
          state={flowState}
          activeKinds={[...new Set(visibleSources.map((source) => source.kind))]}
          queriedKinds={visibleQueriedKinds}
          snapshotAvailable={Boolean(latestTurn?.brainContextSnapshotId)}
          libraryAvailability={visibleLibraryAvailability}
        />
      </div>

      {/* Conversation / empty state */}
      <div className="flex-1 space-y-6 mb-4">
        {historyLoading && turns.length === 0 && !interim && (
          <div className="surface-card flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Restoring your private Coach conversation…
          </div>
        )}
        {!historyLoading && turns.length === 0 && !interim && (
          <div className="surface-card p-8 text-center">
            <Sparkles className="w-7 h-7 text-purple-400 mx-auto mb-3" />
            <p className="text-zinc-300 font-medium mb-1">What would you like to know?</p>
            <p className="text-zinc-500 text-sm mb-5">
              RapidTal Coach combines verified company evidence, current permitted work and published Business Library guidance, then saves the exact context before answering.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s, "private")}
                  className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <ChatTurn
            key={i}
            turn={t}
            clientId={clientId}
            canCurate={canCurate}
            coachRole={coachRole}
            speakerName={speakerName}
            teamMembers={teamMembers}
            taskOptions={taskOptions}
            actionsEnabled={actionsEnabled}
            history={turns.slice(Math.max(0, i - 4), i).map((p) => ({ question: p.question, answer: p.answer }))}
            onAsk={(value) => ask(value, "private")}
          />
        ))}

        {interim && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[85%]">
                <p className="mb-1 text-right text-3xs font-medium text-zinc-500">
                  {speakerName} — {coachRole === "client" ? "Client" : "VA"}
                </p>
                <div className="rounded-2xl rounded-br-sm bg-orange-500 px-4 py-2.5 text-sm text-zinc-950">
                  {interim.question}
                </div>
              </div>
            </div>
            <div className="surface-card p-4">
              <p className="mb-2 text-3xs font-semibold uppercase tracking-wide text-purple-300">RapidTal Coach</p>
              {interim.answer ? (
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {interim.answer}
                  <span className="ml-0.5 animate-pulse">▍</span>
                </p>
              ) : (
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching the brain…
                </div>
              )}
            </div>
          </div>
        )}
        {askFailure && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-200">The Brain could not finish safely</p>
                <p className="mt-1 text-xs leading-5 text-red-200/70">{askFailure.message}</p>
              </div>
              {askFailure.recoverable && (
                <Button size="sm" variant="outline" onClick={() => ask(askFailure.question)} disabled={loading}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="sticky bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pt-3 pb-2">
        <div className="mb-2 flex flex-wrap gap-2" aria-label="Coach conversation audience">
          <CoachModeButton active={coachMode === "private"} onClick={() => setCoachMode("private")} icon={LockKeyhole}>
            Private with Coach
          </CoachModeButton>
          {actionsEnabled && coachRole === "va" && (
            <>
              <CoachModeButton active={coachMode === "message_client"} onClick={() => setCoachMode("message_client")} icon={MessageSquare}>Send to Client</CoachModeButton>
              <CoachModeButton active={coachMode === "update_task"} onClick={() => setCoachMode("update_task")} icon={ListTodo}>Update Task</CoachModeButton>
              <CoachModeButton active={coachMode === "submit_review"} onClick={() => setCoachMode("submit_review")} icon={Check}>Submit for Review</CoachModeButton>
            </>
          )}
          {actionsEnabled && coachRole === "client" && (
            <>
              <CoachModeButton active={coachMode === "message_va_team"} onClick={() => setCoachMode("message_va_team")} icon={MessageSquare}>
                Send to VA Team
              </CoachModeButton>
              <CoachModeButton active={coachMode === "create_task"} onClick={() => setCoachMode("create_task")} icon={ListTodo}>
                Create Task
              </CoachModeButton>
              <CoachModeButton active={coachMode === "update_task"} onClick={() => setCoachMode("update_task")} icon={ListTodo}>Update Task</CoachModeButton>
              <CoachModeButton active={coachMode === "review_task"} onClick={() => setCoachMode("review_task")} icon={Check}>Review Work</CoachModeButton>
            </>
          )}
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          {coachMode === "private"
            ? "Only you can open this Coach conversation. Conversation history is kept for 12 months; short-lived diagnostic prompts expire after 30 days."
            : "The Coach will prepare a preview. Nothing is shared until you confirm."}
        </p>
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={4_000}
            placeholder={coachMode === "private" ? "Ask your Coach about the business or current work…" : "Tell the Coach what you want prepared…"}
            disabled={loading}
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          <Button type="submit" disabled={loading || question.trim().length < 3} className="gap-1.5 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

function CoachModeButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LockKeyhole;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-purple-400/45 bg-purple-500/10 text-purple-200"
          : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/** One Q&A exchange — clean answer by default, with optional "Go deeper" + sources. */
function ChatTurn({
  turn, clientId, history, canCurate, coachRole, speakerName,
  teamMembers, actionsEnabled, onAsk,
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
}) {
  const [showSources, setShowSources] = useState(true);
  const [deepAnswer, setDeepAnswer] = useState<string | null>(null);
  const [deepEvidence, setDeepEvidence] = useState<AnswerEvidence | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [teachText, setTeachText] = useState("");
  const [teachBusy, setTeachBusy] = useState(false);
  const [taught, setTaught] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionComplete, setActionComplete] = useState(turn.actionStatus === "completed");
  const [actionDraft, setActionDraft] = useState<CoachActionDraft | null>(turn.actionDraft ?? null);

  const unanswered = turn.sources.length === 0;

  async function teach() {
    if (teachText.trim().length < 3 || teachBusy) return;
    setTeachBusy(true);
    try {
      await api.post(ROUTES.vault.teach(), {
        clientId, question: turn.question, answer: teachText.trim(),
      }, { showErrorToast: false });
      setTaught(true);
      setTeaching(false);
      toast.success("Thanks — the brain learned it. Next person who asks gets your answer.");
    } catch (error) {
      toast.error(errorMessage(error, "The answer could not be taught to the Brain."));
    } finally {
      setTeachBusy(false);
    }
  }

  async function goDeeper() {
    if (deepLoading || deepAnswer) return;
    setDeepLoading(true);
    // Stream the deep answer so the long (gpt-4o) generation shows progress as it
    // arrives; fall back to the non-streaming endpoint if streaming fails.
    const r = await askStream(clientId, turn.question, history, (a) => setDeepAnswer(a), "deep", turn.coachMode);
    if (r.ok) {
      setDeepEvidence({
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
        setDeepAnswer(res.answer);
        setDeepEvidence({
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
    setDeepLoading(false);
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
      } else {
        toast.success("Task updated.");
      }
      setActionComplete(true);
    } catch (error) {
      toast.error(errorMessage(error, "The Coach action could not be completed."));
    } finally {
      setActionBusy(false);
    }
  }

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
                          : "Client review preview"}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Nothing has been shared yet. Review the Coach draft, then confirm below.
                </p>
                {!actionComplete && actionDraft.type === "create_task" && (
                  <div className="mt-3 grid gap-3">
                    <label className="text-xs text-zinc-400">Task title
                      <Input value={actionDraft.title} maxLength={300}
                        onChange={(event) => setActionDraft({ ...actionDraft, title: event.target.value })}
                        className="mt-1.5 bg-zinc-900 text-zinc-100" />
                    </label>
                    <label className="text-xs text-zinc-400">Task brief
                      <Textarea value={actionDraft.brief} maxLength={10000} rows={5}
                        onChange={(event) => setActionDraft({ ...actionDraft, brief: event.target.value })}
                        className="mt-1.5 bg-zinc-900 text-zinc-100" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-xs text-zinc-400">Assign to
                        <select value={actionDraft.assigneeId ?? ""}
                          onChange={(event) => setActionDraft({ ...actionDraft, assigneeId: event.target.value || null })}
                          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                          <option value="">Leave unassigned</option>
                          {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-zinc-400">Priority
                        <select value={actionDraft.priority}
                          onChange={(event) => setActionDraft({ ...actionDraft, priority: Number(event.target.value) as 1 | 2 | 3 | 4 })}
                          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                          <option value={1}>Urgent</option><option value={2}>High</option><option value={3}>Normal</option><option value={4}>Low</option>
                        </select>
                      </label>
                      <label className="text-xs text-zinc-400">Due date
                        <Input type="date" value={actionDraft.dueDate ?? ""}
                          onChange={(event) => setActionDraft({ ...actionDraft, dueDate: event.target.value || null })}
                          className="mt-1.5 bg-zinc-900 text-zinc-100" />
                      </label>
                    </div>
                  </div>
                )}
                {!actionComplete && actionDraft.type === "send_message" && (
                  <label className="mt-3 block text-xs text-zinc-400">Message
                    <Textarea value={actionDraft.message} maxLength={4000} rows={5}
                      onChange={(event) => setActionDraft({ ...actionDraft, message: event.target.value })}
                      className="mt-1.5 bg-zinc-900 text-zinc-100" />
                  </label>
                )}
                {!actionComplete && actionDraft.type !== "create_task" && actionDraft.type !== "send_message" && (
                  <div className="mt-3 grid gap-3">
                    <label className="text-xs text-zinc-400">Task
                      <select value={actionDraft.taskId} onChange={(event) => setActionDraft({ ...actionDraft, taskId: event.target.value })}
                        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                        {taskOptions.filter((task) => actionDraft.type !== "review_task" || task.status === "review").map((task) => <option key={task.id} value={task.id}>{task.title} — {task.status.replaceAll("_", " ")}</option>)}
                      </select>
                    </label>
                    {actionDraft.type === "update_task" && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-xs text-zinc-400">Status
                          <select value={actionDraft.status} onChange={(event) => setActionDraft({ ...actionDraft, status: event.target.value as "todo" | "in_progress" | "review" | "done" })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                            <option value="todo">To do</option><option value="in_progress">In progress</option><option value="review">Review</option><option value="done">Done</option>
                          </select>
                        </label>
                        <label className="text-xs text-zinc-400">Priority
                          <select value={actionDraft.priority} onChange={(event) => setActionDraft({ ...actionDraft, priority: Number(event.target.value) as 1 | 2 | 3 | 4 })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                            <option value={1}>Urgent</option><option value={2}>High</option><option value={3}>Normal</option><option value={4}>Low</option>
                          </select>
                        </label>
                        <label className="text-xs text-zinc-400">Due date
                          <Input type="date" value={actionDraft.dueDate ?? ""} onChange={(event) => setActionDraft({ ...actionDraft, dueDate: event.target.value || null })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
                        </label>
                      </div>
                    )}
                    {actionDraft.type === "review_task" && (
                      <label className="text-xs text-zinc-400">Decision
                        <select value={actionDraft.decision} onChange={(event) => setActionDraft({ ...actionDraft, decision: event.target.value as "approve" | "changes" })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                          <option value="approve">Approve</option><option value="changes">Request changes</option>
                        </select>
                      </label>
                    )}
                    <label className="text-xs text-zinc-400">{actionDraft.type === "submit_review" ? "Submission note" : actionDraft.type === "review_task" ? "Review note" : "Update note"}
                      <Textarea value={actionDraft.note} maxLength={2000} rows={3} onChange={(event) => setActionDraft({ ...actionDraft, note: event.target.value })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
                    </label>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={confirmCoachAction}
                  disabled={actionBusy || actionComplete || (actionDraft.type === "create_task" ? !actionDraft.title.trim() || !actionDraft.brief.trim() : actionDraft.type === "send_message" ? !actionDraft.message.trim() : !actionDraft.taskId)}
                  className="mt-3 gap-1.5"
                >
                  {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionComplete ? <Check className="h-3.5 w-3.5" /> : actionDraft.type === "send_message" ? <Send className="h-3.5 w-3.5" /> : <ListTodo className="h-3.5 w-3.5" />}
                  {actionComplete
                    ? "Confirmed"
                    : turn.coachMode === "create_task"
                      ? "Create Task"
                      : turn.coachMode === "message_client"
                        ? "Send to Client"
                        : turn.coachMode === "message_va_team" ? "Send to VA Team" : turn.coachMode === "submit_review" ? "Submit for Review" : turn.coachMode === "review_task" ? "Confirm Review" : "Update Task"}
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

        {deepAnswer && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <p className="label-section mb-1.5">More detail</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {deepAnswer}
              {deepLoading && <span className="ml-0.5 animate-pulse">▍</span>}
            </p>
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

        {/* Teach the brain — capture knowledge at the moment a gap is found */}
        {unanswered && !taught && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            {!teaching ? (
              <button
                onClick={() => setTeaching(true)}
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Know the answer? Teach the brain
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-400">
                  Type the answer — it&apos;s saved to the Knowledge Base and the next person who asks gets it.
                </p>
                <Textarea
                  value={teachText}
                  onChange={(e) => setTeachText(e.target.value)}
                  rows={3}
                  placeholder="The answer is…"
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={teach} disabled={teachBusy || teachText.trim().length < 3} className="gap-1.5 h-7 text-xs">
                    {teachBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <GraduationCap className="w-3 h-3" />}
                    Teach it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTeaching(false)} className="h-7 text-xs border-zinc-700">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {taught && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-green-400">
            <Check className="w-3.5 h-3.5" /> Learned — saved to the Knowledge Base.
          </p>
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
            <CoachFeedback
              clientId={clientId}
              question={turn.question}
              answer={deepAnswer ?? turn.answer}
              snapshotId={deepEvidence?.brainContextSnapshotId ?? turn.brainContextSnapshotId}
              coachRole={coachRole}
              sources={(deepEvidence?.sources ?? turn.sources).map((source) => ({
                kind: source.kind,
                title: source.title,
                itemId: source.itemId,
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
}

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
