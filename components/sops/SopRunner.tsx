"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { parseSopSteps } from "@/lib/sop-steps";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, RotateCcw, Sparkles, Loader2, PartyPopper } from "lucide-react";

interface AskResponse { answer: string }

export function SopRunner({ title, body, clientId }: {
  title: string; body: string; clientId: string;
}) {
  const steps = useMemo(() => parseSopSteps(body), [body]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [help, setHelp] = useState<Record<number, string>>({});
  const [helpLoading, setHelpLoading] = useState<number | null>(null);

  const completed = done.size;
  const pct = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const allDone = steps.length > 0 && completed === steps.length;

  function toggle(i: number) {
    setDone((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  async function askHelp(i: number) {
    if (helpLoading !== null) return;
    setHelpLoading(i);
    try {
      const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
        clientId,
        question: `I'm following our SOP "${title}". For this step, give me practical help, specifics, and anything I should watch out for. Step: ${steps[i]}`,
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
          <span className="text-sm text-zinc-400">{completed}/{steps.length} done</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
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

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const isDone = done.has(i);
          return (
            <div key={i} className={cn("rounded-xl border bg-zinc-900 p-4 transition-colors", isDone ? "border-green-500/30 bg-green-500/5" : "border-zinc-800")}>
              <div className="flex items-start gap-3">
                <button onClick={() => toggle(i)} className="shrink-0 mt-0.5" title={isDone ? "Mark not done" : "Mark done"}>
                  {isDone ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Circle className="w-5 h-5 text-zinc-600 hover:text-zinc-400" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-zinc-500">STEP {i + 1}</span>
                  </div>
                  <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", isDone ? "text-zinc-500 line-through" : "text-zinc-100")}>
                    {step}
                  </p>

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
