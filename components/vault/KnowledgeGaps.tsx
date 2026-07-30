"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Circle, GraduationCap, X, Loader2, Check } from "lucide-react";

/**
 * Gap workflow: each unanswered question gets "Answer it" (→ pinned KB via
 * teach, gap closes) and, for admins, "Dismiss" (noise). Server pages pass the
 * gap list; we refresh after an action so the list recomputes.
 */
export function KnowledgeGaps({ gaps, clientId, canCurate }: {
  gaps: string[]; clientId: string; canCurate: boolean;
}) {
  const router = useRouter();
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function teach(question: string) {
    if (answer.trim().length < 3 || busy) return;
    setBusy(question);
    try {
      await api.post(ROUTES.vault.teach(), { clientId, question, answer: answer.trim() }, { showErrorToast: false });
      setDone((d) => new Set(d).add(question));
      setAnswering(null);
      setAnswer("");
      toast.success("Gap closed — the brain learned it.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "The answer could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(question: string) {
    if (busy) return;
    setBusy(question);
    try {
      await api.post(ROUTES.vault.gaps(), { clientId, question, action: "dismiss" }, { showErrorToast: false });
      setDone((d) => new Set(d).add(question));
      toast.success("Dismissed.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "The gap could not be dismissed."));
    } finally {
      setBusy(null);
    }
  }

  const open = gaps.filter((g) => !done.has(g));
  if (open.length === 0) {
    return <p className="text-sm text-green-400">No open gaps — every recent question was answered. 🎉</p>;
  }

  return (
    <ul className="space-y-3">
      {open.map((q) => (
        <li key={q} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-start gap-2.5">
            <Circle className="w-4 h-4 text-amber-500/70 mt-0.5 shrink-0" />
            <span className="text-sm text-zinc-200 flex-1">{q}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { setAnswering(answering === q ? null : q); setAnswer(""); }}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-blue-400 transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5" /> Answer it
              </button>
              {canCurate && (
                <button
                  onClick={() => dismiss(q)}
                  disabled={busy === q}
                  title="Dismiss as noise"
                  className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {busy === q && answering !== q ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
          {answering === q && (
            <div className="mt-2.5 pl-6 flex flex-col gap-2">
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                placeholder="Type the answer — it's saved to the Knowledge Base and this gap closes."
                className="bg-zinc-950/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => teach(q)} disabled={busy === q || answer.trim().length < 3} className="gap-1.5 h-7 text-xs">
                  {busy === q ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save answer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAnswering(null)} className="h-7 text-xs border-zinc-700">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
