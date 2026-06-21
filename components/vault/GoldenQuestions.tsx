"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Plus, Play, Check, X, Trash2, Loader2, Target, ChevronDown, ChevronRight,
} from "lucide-react";

interface GoldenQuestion {
  id: string;
  question: string;
  last_status: "pass" | "fail" | null;
  last_checked_at: string | null;
  history: { s: string; at: string }[];
}

/**
 * Saved spot-checks for a client's Brain. "Ask" pushes the question into the
 * chat below; after reading the answer the admin records pass/fail, building
 * a regression history per question (the dots).
 */
export function GoldenQuestions({ clientId, onAsk }: { clientId: string; onAsk: (q: string) => void }) {
  const [questions, setQuestions] = useState<GoldenQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<{ questions: GoldenQuestion[] }>(`${ROUTES.goldenQuestions()}?clientId=${clientId}`, { showErrorToast: false })
      .then((d) => { if (!cancelled) setQuestions(d.questions); })
      .catch(() => { if (!cancelled) setQuestions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  async function add() {
    const q = draft.trim();
    if (q.length < 5) return;
    setBusy("add");
    try {
      const { question } = await api.post<{ question: GoldenQuestion }>(ROUTES.goldenQuestions(), { clientId, question: q });
      setQuestions((p) => [...p, question]);
      setDraft("");
    } catch { /* api-client toasts */ } finally { setBusy(null); }
  }

  async function record(id: string, status: "pass" | "fail") {
    setBusy(id);
    try {
      const { question } = await api.patch<{ question: GoldenQuestion }>(ROUTES.goldenQuestions(), { id, status });
      setQuestions((p) => p.map((x) => (x.id === id ? question : x)));
      toast.success(status === "pass" ? "Marked as passing." : "Marked as failing — feed the Vault and re-check.");
    } catch { /* api-client toasts */ } finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api.delete(ROUTES.goldenQuestions(), { id });
      setQuestions((p) => p.filter((x) => x.id !== id));
    } catch { /* api-client toasts */ } finally { setBusy(null); }
  }

  const passing = questions.filter((q) => q.last_status === "pass").length;
  const failing = questions.filter((q) => q.last_status === "fail").length;

  return (
    <div className="surface-card rounded-xl mb-6 overflow-hidden">
      <button onClick={() => setOpen((s) => !s)} className="w-full flex items-center gap-2 p-4 hover:bg-zinc-800/40 transition-colors">
        <Target className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-zinc-100">Golden questions</span>
        <span className="text-xs text-zinc-500">
          {questions.length === 0 ? "— save the questions this Brain must answer well"
            : <>· <span className="text-green-400">{passing} passing</span>{failing > 0 && <> · <span className="text-red-400">{failing} failing</span></>}</>}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div>
          ) : (
            <>
              {questions.length > 0 && (
                <div className="divide-y divide-zinc-800 mb-3">
                  {questions.map((q) => (
                    <div key={q.id} className="flex items-center gap-2 py-2.5">
                      {/* history dots: oldest → newest, last 8 */}
                      <div className="flex items-center gap-1 shrink-0 w-[72px]">
                        {(q.history ?? []).slice(-8).map((h, i) => (
                          <span key={i} title={`${h.s} — ${formatDate(h.at)}`}
                            className={cn("w-1.5 h-1.5 rounded-full", h.s === "pass" ? "bg-green-500" : "bg-red-500")} />
                        ))}
                        {(q.history ?? []).length === 0 && <span className="text-3xs text-zinc-600">never run</span>}
                      </div>
                      <p className="text-sm text-zinc-300 flex-1 min-w-0 truncate" title={q.question}>{q.question}</p>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => onAsk(q.question)} title="Ask now" aria-label="Ask now"
                          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void record(q.id, "pass")} disabled={busy === q.id} title="Record pass" aria-label="Record pass"
                          className="p-1.5 rounded text-zinc-500 hover:text-green-400 hover:bg-zinc-800 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void record(q.id, "fail")} disabled={busy === q.id} title="Record fail" aria-label="Record fail"
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void remove(q.id)} disabled={busy === q.id} title="Delete" aria-label="Delete question"
                          className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
                  placeholder='e.g. "What is the free shipping threshold?"'
                  className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                />
                <button onClick={() => void add()} disabled={busy === "add" || draft.trim().length < 5}
                  className="inline-flex items-center gap-1 px-3 rounded-lg text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50">
                  {busy === "add" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                </button>
              </div>
              <p className="text-2xs text-zinc-600 mt-2">
                Workflow: hit ▶ to ask, read the answer below, then record ✓/✗. Re-run after every crawl or dossier refresh.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
