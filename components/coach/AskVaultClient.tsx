"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  Flag,
  History,
  ListTodo,
  LockKeyhole,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { CoachProgressPanel } from "@/components/vault/CoachProgressPanel";
import { CoachMemoryPanel } from "@/components/vault/CoachMemoryPanel";
import {
  AskBrainFlow,
  type AskFlowState,
} from "@/components/intelligence/AskBrainFlow";
import { ChatTurn } from "./ChatTurn";
import {
  useCoachChat,
  type CoachRole,
  type CoachTaskOption,
  type CoachTeamMember,
  type Turn,
} from "./useCoachChat";

const SUGGESTIONS = [
  "What services do we offer, based on our company evidence?",
  "Which SEO basics should our business apply first?",
  "How could we improve our Facebook Ads approach?",
  "What knowledge is missing from our Brain?",
];

/** Distance from the bottom within which auto-scroll keeps following the stream. */
const NEAR_BOTTOM_PX = 120;

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
  timeZone = "UTC",
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
  timeZone?: string;
  /** Lets a parent (e.g. golden questions panel) submit a question into this chat. */
  externalAsk?: { q: string; nonce: number } | null;
}) {
  const {
    question,
    setQuestion,
    coachMode,
    setCoachMode,
    turns,
    historyLoading,
    hasMoreHistory,
    loadingOlder,
    loadOlderTurns,
    loading,
    interim,
    askFailure,
    streamAbortRef,
    ask,
    goDeeper,
    newConversation,
  } = useCoachChat({ clientId, coachRole, actionsEnabled, persistConversation, externalAsk });
  const endRef = useRef<HTMLDivElement>(null);
  // Auto-scroll stays "pinned" only while the user is near the bottom — scrolling
  // up during a streamed answer must not yank them back down on every token.
  const pinnedToBottomRef = useRef(true);
  const prevLatestTurnRef = useRef<Turn | null>(null);
  const prevInterimRef = useRef(false);

  // Kill any in-flight SSE stream when the page unmounts — otherwise the paid
  // LLM stream keeps running and onProgress fires against a dead component.
  useEffect(() => () => streamAbortRef.current?.abort(), [streamAbortRef]);

  // Track the user's position: scrolling more than ~120px above the bottom
  // unpins auto-scroll; scrolling back down re-pins it.
  useEffect(() => {
    const onScroll = () => {
      const end = endRef.current;
      if (!end) return;
      pinnedToBottomRef.current =
        end.getBoundingClientRect().bottom - window.innerHeight <= NEAR_BOTTOM_PX;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const latestTurn = turns.at(-1) ?? null;
    // An appended turn (or a newly created interim bubble) always scrolls;
    // a prepend ("Load older messages") must not move the reading position.
    const appended = latestTurn !== prevLatestTurnRef.current;
    const interimStarted = Boolean(interim) && !prevInterimRef.current;
    prevLatestTurnRef.current = latestTurn;
    prevInterimRef.current = Boolean(interim);
    if (appended || interimStarted || pinnedToBottomRef.current) {
      // Token-by-token following uses instant scrolling — a smooth animation
      // lags behind the stream and would read as "scrolled up", unpinning itself.
      const behavior: ScrollBehavior = appended || interimStarted ? "smooth" : "auto";
      endRef.current?.scrollIntoView({ behavior });
    }
  }, [turns, interim]);

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
        {persistConversation && <CoachProgressPanel clientId={clientId} timeZone={timeZone} />}
        {persistConversation && <CoachMemoryPanel clientId={clientId} />}
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

        {hasMoreHistory && (
          <div className="flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={loadOlderTurns}
              disabled={loadingOlder}
              className="gap-1.5 border-zinc-700 text-xs"
            >
              {loadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
              Load older messages
            </Button>
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
            onGoDeeper={goDeeper}
            onActionComplete={() => setCoachMode("private")}
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
          <CoachModeButton active={coachMode === "create_goal"} onClick={() => setCoachMode("create_goal")} icon={Target}>Track Goal</CoachModeButton>
          <CoachModeButton active={coachMode === "create_commitment"} onClick={() => setCoachMode("create_commitment")} icon={Flag}>Make Commitment</CoachModeButton>
          <CoachModeButton active={coachMode === "create_memory"} onClick={() => setCoachMode("create_memory")} icon={BookmarkPlus}>Remember</CoachModeButton>
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
