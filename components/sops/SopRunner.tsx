"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { parseSopSteps, type SopStep } from "@/lib/sop-steps";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, RotateCcw, Sparkles, Loader2, PartyPopper, Lightbulb, ClipboardList } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface AskResponse { answer: string }

export function SopRunner({ sopId, title, body, clientId, structured, intro, prerequisites }: {
  sopId: string; title: string; body: string; clientId: string;
  structured?: SopStep[]; intro?: string; prerequisites?: string[];
}) {
  // Prefer real structured steps; fall back to parsing the body for legacy SOPs.
  const steps: SopStep[] = useMemo(
    () => (structured && structured.length
      ? structured
      : parseSopSteps(body).map((t) => ({ title: t, detail: "" }))),
    [structured, body],
  );
  const hasPrereqs = (prerequisites?.length ?? 0) > 0;
  const [done, setDone] = useState<Set<number>>(new Set());
  const [help, setHelp] = useState<Record<number, string>>({});
  const [helpLoading, setHelpLoading] = useState<number | null>(null);

  // Best-effort usage tracking — never blocks the runner.
  const runId = useRef<string | null>(null);
  const completedLogged = useRef(false);

  async function ensureRun() {
    if (runId.current) return;
    try {
      const r = await api.post<{ id: string }>(ROUTES.sopRun(), { sopId, stepsTotal: steps.length }, { showErrorToast: false });
      runId.current = r.id ?? null;
    } catch { /* tracking is best-effort */ }
  }

  async function logProgress(stepsDone: number, isComplete: boolean) {
    if (!runId.current) return;
    try {
      await api.patch(ROUTES.sopRun(), { id: runId.current, stepsDone, completed: isComplete }, { showErrorToast: false });
    } catch { /* best-effort */ }
  }

  const completed = done.size;
  const pct = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const allDone = steps.length > 0 && completed === steps.length;

  function toggle(i: number) {
    setDone((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      // Start tracking on first interaction; log completion when all done.
      if (n.size > 0) void ensureRun().then(() => {
        const isComplete = n.size === steps.length && steps.length > 0;
        if (isComplete && !completedLogged.current) completedLogged.current = true;
        void logProgress(n.size, isComplete);
      });
      return n;
    });
  }

  async function askHelp(i: number) {
    if (helpLoading !== null) return;
    setHelpLoading(i);
    try {
      const s = steps[i];
      const stepText = s.detail ? `${s.title} — ${s.detail}` : s.title;
      const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
        clientId,
        question: `I'm following our SOP "${title}". For this step, give me practical help, specifics, and anything I should watch out for. Step: ${stepText}`,
      }, { showErrorToast: false });
      setHelp((h) => ({ ...h, [i]: res.answer }));
    } catch {
      setHelp((h) => ({ ...h, [i]: "Couldn't reach the brain — try again." }));
    } finally {
      setHelpLoading(null);
    }
  }

  if (steps.length === 0) {
    return <p className="text-sm text-zinc-400">This SOP has no steps to run yet.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress */}
      <div className="surface-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <span className="text-sm text-zinc-400 shrink-0 ml-3">{completed}/{steps.length} done</span>
        </div>
        {intro && <p className="text-sm text-zinc-400 leading-relaxed mb-3">{intro}</p>}
        <ProgressBar value={pct} trackClassName="h-2.5 w-full" barClassName="bg-gradient-to-r from-blue-500 to-green-500" />
        {allDone && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
            <PartyPopper className="w-4 h-4" /> All steps complete — nice work.
          </div>
        )}
        {completed > 0 && (
          <button onClick={() => { setDone(new Set()); }} className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Prerequisites */}
      {hasPrereqs && (
        <div className="surface-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mb-2">
            <ClipboardList className="w-3.5 h-3.5" /> Before you start
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {prerequisites!.map((p, i) => <li key={i} className="text-sm text-zinc-300">{p}</li>)}
          </ul>
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const isDone = done.has(i);
          return (
            <div key={i} className={cn("rounded-xl border bg-zinc-900 p-4 transition-colors", isDone ? "border-green-500/30 bg-green-500/5" : "border-zinc-800")}>
              <div className="flex items-start gap-3">
                <button onClick={() => toggle(i)} className="shrink-0 mt-0.5" title={isDone ? "Mark not done" : "Mark done"} aria-label={isDone ? `Mark step ${i + 1} not done` : `Mark step ${i + 1} done`} aria-pressed={isDone}>
                  {isDone ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Circle className="w-5 h-5 text-zinc-600 hover:text-zinc-400" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-2xs font-semibold text-zinc-500">STEP {i + 1}</span>
                  </div>
                  <p className={cn("text-sm font-medium leading-relaxed", isDone ? "text-zinc-500 line-through" : "text-zinc-100")}>
                    {step.title}
                  </p>
                  {step.detail && (
                    <p className={cn("text-sm leading-relaxed whitespace-pre-wrap mt-1", isDone ? "text-zinc-600" : "text-zinc-400")}>
                      {step.detail}
                    </p>
                  )}
                  {step.tip && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/5 border border-amber-500/15 px-2.5 py-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-200/80 leading-relaxed">{step.tip}</p>
                    </div>
                  )}

                  <button
                    onClick={() => askHelp(i)}
                    disabled={helpLoading !== null}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                  >
                    {helpLoading === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {help[i] ? "Ask again" : "Help with this step"}
                  </button>

                  {help[i] && (
                    <div className="mt-2 rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2.5">
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{help[i]}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
