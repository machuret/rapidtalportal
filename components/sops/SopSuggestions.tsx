"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Wand2, X, Lightbulb } from "lucide-react";

export interface SopSuggestion {
  id: string;
  title: string;
  scope: string | null;
  category: string | null;
  step_count: number | null;
  status: string;
  created_at: string;
}

/**
 * Mass-generate a backlog of fresh SOP ideas, then create or dismiss each.
 * Generation excludes existing SOPs + every prior suggestion, so an idea is
 * never proposed twice. Global library only (clientId = null).
 */
export function SopSuggestions({ clientId, initial }: { clientId: string | null; initial: SopSuggestion[] }) {
  const router = useRouter();
  const [items, setItems] = useState<SopSuggestion[]>(initial);
  const [category, setCategory] = useState("");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await api.post<{ added: number; suggestions: SopSuggestion[] }>(
        ROUTES.sopSuggestions(), { clientId, category: category.trim() || undefined, count: 15 }, { showErrorToast: false },
      );
      setItems(res.suggestions);
      toast.success(res.added > 0 ? `Added ${res.added} new idea${res.added !== 1 ? "s" : ""}.` : "No new ideas this round — try a different category.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate ideas.");
    } finally {
      setGenerating(false);
    }
  }

  async function dismiss(id: string) {
    setItems((p) => p.filter((s) => s.id !== id));
    try { await api.patch(ROUTES.sopSuggestions(), { id, status: "dismissed" }, { showErrorToast: false }); }
    catch { /* best-effort; reappears on reload if the write failed */ }
  }

  async function createFrom(s: SopSuggestion) {
    setItems((p) => p.filter((x) => x.id !== s.id));
    try { await api.patch(ROUTES.sopSuggestions(), { id: s.id, status: "created" }, { showErrorToast: false }); } catch { /* ignore */ }
    const params = new URLSearchParams({ scope: "global", title: s.title });
    if (s.category) params.set("category", s.category);
    router.push(`/sops/new?${params.toString()}`);
  }

  return (
    <div className="surface-card p-4 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="label-section flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-400" /> SOP idea backlog</p>
        <span className="text-xs text-zinc-500">{items.length} open</span>
        <div className="flex items-center gap-2 ml-auto">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className="bg-zinc-800 border-zinc-700 h-8 text-sm w-44" />
          <Button size="sm" onClick={generate} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate ideas
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((s) => (
            <div key={s.id} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{s.title}</p>
                {s.scope && <p className="text-xs text-zinc-500 mt-0.5">{s.scope}</p>}
                <p className="text-[11px] text-zinc-600 mt-0.5">{s.category ? `${s.category} · ` : ""}{s.step_count ?? 6} steps</p>
              </div>
              <button onClick={() => createFrom(s)} className="text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 shrink-0 mt-0.5">
                <Wand2 className="w-3.5 h-3.5" /> Create
              </button>
              <button onClick={() => dismiss(s.id)} title="Dismiss — never suggest this again" className="text-zinc-600 hover:text-red-400 shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500 mt-2">Generate a batch of fresh SOP ideas — already-created and dismissed ones never come back.</p>
      )}
    </div>
  );
}
