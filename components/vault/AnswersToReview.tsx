"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Check, Loader2 } from "lucide-react";

export interface ReviewItem {
  id: string;
  question: string;
  answer: string;
  sources: { kind: string; title: string }[];
}

/**
 * 👎 triage: each downvoted answer shows the sources that produced it, with
 * "Add correction" (→ pinned KB override via teach) and "Resolve" to clear it
 * from the queue.
 */
export function AnswersToReview({ items, clientId }: { items: ReviewItem[]; clientId: string }) {
  const router = useRouter();
  const [fixing, setFixing] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  async function resolve(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      await api.patch(ROUTES.vault.feedback(), { clientId, id, resolved: true });
      setCleared((c) => new Set(c).add(id));
      router.refresh();
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(null);
    }
  }

  async function fix(item: ReviewItem) {
    if (correction.trim().length < 3 || busy) return;
    setBusy(item.id);
    try {
      // The correction becomes a pinned KB entry that outranks the bad source,
      // then the review item resolves.
      await api.post(ROUTES.vault.teach(), { clientId, question: item.question, answer: correction.trim() });
      await api.patch(ROUTES.vault.feedback(), { clientId, id: item.id, resolved: true });
      setCleared((c) => new Set(c).add(item.id));
      setFixing(null);
      setCorrection("");
      toast.success("Correction saved — the brain will use it from now on.");
      router.refresh();
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(null);
    }
  }

  const open = items.filter((i) => !cleared.has(i.id));
  if (open.length === 0) return <p className="text-sm text-green-400">Review queue is clear. 🎉</p>;

  return (
    <div className="space-y-3">
      {open.map((f) => (
        <div key={f.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-sm text-zinc-100 font-medium">{f.question}</p>
          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{f.answer}</p>

          {f.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {f.sources.map((s, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 truncate max-w-[14rem]">
                  {s.title}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-3">
            <button
              onClick={() => { setFixing(fixing === f.id ? null : f.id); setCorrection(""); }}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-blue-400 transition-colors"
            >
              <GraduationCap className="w-3.5 h-3.5" /> Add correction
            </button>
            <button
              onClick={() => resolve(f.id)}
              disabled={busy === f.id}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-green-400 transition-colors disabled:opacity-50"
            >
              {busy === f.id && fixing !== f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Resolve
            </button>
          </div>

          {fixing === f.id && (
            <div className="mt-2.5 flex flex-col gap-2">
              <Textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                rows={3}
                placeholder="Type the correct answer — saved as a pinned KB entry the brain will prefer."
                className="bg-zinc-950/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => fix(f)} disabled={busy === f.id || correction.trim().length < 3} className="gap-1.5 h-7 text-xs">
                  {busy === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save correction
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFixing(null)} className="h-7 text-xs border-zinc-700">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
