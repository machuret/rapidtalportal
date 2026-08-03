"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Loader2, Send, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachChat, type CoachRole } from "@/components/coach/useCoachChat";
import {
  COACH_PAGE_CONTEXTS,
  type CoachPageContextKey,
} from "@/supabase/functions/_shared/coach-page-context";

const CLIENT_QUESTIONS = [
  "What should I do here?",
  "What still needs my attention here?",
  "Can my VA help with this?",
  "What should I do next?",
] as const;

const VA_QUESTIONS = [
  "What should I do here?",
  "What still needs my attention here?",
  "What can I do here for the client?",
  "What should I do next?",
] as const;

export function ContextualCoachPanel({
  clientId,
  coachRole,
  contextKey,
  onClose,
  guideTitle,
}: {
  clientId: string;
  coachRole: CoachRole;
  contextKey: CoachPageContextKey;
  onClose: () => void;
  guideTitle: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const context = COACH_PAGE_CONTEXTS[contextKey];
  const questions = coachRole === "va" ? VA_QUESTIONS : CLIENT_QUESTIONS;
  const {
    question,
    setQuestion,
    turns,
    interim,
    loading,
    askFailure,
    streamAbortRef,
    ask,
  } = useCoachChat({
    clientId,
    coachRole,
    actionsEnabled: false,
    persistConversation: false,
    pageContext: contextKey,
  });
  const visible = interim ?? turns.at(-1) ?? null;

  useEffect(() => {
    const activeStreamRef = streamAbortRef;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      activeStreamRef.current?.abort();
    };
  }, [streamAbortRef]);

  function keepFocusInside(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void ask(question, "private");
  }

  const uniqueSources = visible
    ? [...new Map(visible.sources.map((source) => [`${source.kind}:${source.itemId ?? source.title}`, source])).values()].slice(0, 4)
    : [];

  return (
    <div className="fixed inset-0 z-modal flex justify-end bg-black/65 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contextual-coach-title"
        onKeyDown={keepFocusInside}
        className="flex h-full w-full max-w-lg flex-col border-l border-zinc-700 bg-zinc-950 shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-zinc-800 px-5 py-4">
          <span className="rounded-xl bg-purple-500/10 p-2 text-purple-300"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-wide text-purple-300">Help where you are</p>
            <h2 id="contextual-coach-title" className="mt-0.5 text-base font-semibold text-white">Coach for {context.label}</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{context.purpose}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close contextual Coach" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {!visible && !askFailure && (
            <div>
              <p className="text-sm font-medium text-zinc-200">What would help?</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Coach knows which workspace is open and combines that with your permitted company and work context.</p>
              <div className="mt-4 grid gap-2">
                {questions.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void ask(prompt, "private")} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300 hover:border-purple-500/40 hover:text-white">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visible && (
            <div className="space-y-3">
              <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-orange-500 px-4 py-2.5 text-sm text-zinc-950">
                {visible.question}
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-2xs font-semibold uppercase tracking-wide text-purple-300">RapidTal Coach</p>
                {visible.answer ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{visible.answer}{interim && <span className="ml-0.5 animate-pulse">▍</span>}</p>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking this workspace and your company context…</p>
                )}
                {uniqueSources.length > 0 && !interim && (
                  <div className="mt-4 border-t border-zinc-800 pt-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-zinc-600">Company context used</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {uniqueSources.map((source) => <span key={`${source.kind}:${source.itemId ?? source.title}`} className="rounded-full bg-zinc-800 px-2 py-1 text-2xs text-zinc-400">{source.title}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {askFailure && !interim && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4" role="alert">
              <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" /><p className="text-sm text-red-200">{askFailure.message}</p></div>
              {askFailure.recoverable && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void ask(askFailure.question, "private")}>Retry</Button>}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 bg-zinc-950 p-4">
          <form onSubmit={submit} className="flex gap-2">
            <label htmlFor="contextual-coach-question" className="sr-only">Ask Coach about this page</label>
            <input
              ref={inputRef}
              id="contextual-coach-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={loading}
              placeholder={`Ask about ${context.label}…`}
              className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-purple-500 disabled:opacity-60"
            />
            {loading ? (
              <Button type="button" variant="outline" aria-label="Stop Coach answer" onClick={() => streamAbortRef.current?.abort()}><Square className="h-4 w-4" /></Button>
            ) : (
              <Button type="submit" aria-label="Ask contextual Coach" disabled={question.trim().length < 3}><Send className="h-4 w-4" /></Button>
            )}
          </form>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <Link href="/ask" className="text-purple-300 hover:text-purple-200">Open full Coach</Link>
            <Link href={`/guide?open=${encodeURIComponent(guideTitle)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-zinc-500 hover:text-zinc-300"><BookOpen className="mr-1 h-3.5 w-3.5" /> Open Guide</Link>
          </div>
        </footer>
      </section>
    </div>
  );
}
