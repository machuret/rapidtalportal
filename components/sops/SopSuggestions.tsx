"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Wand2, Trash2, Lightbulb, ListChecks } from "lucide-react";

export interface SopSuggestion {
  id: string;
  title: string;
  scope: string | null;
  category: string | null;
  step_count: number | null;
  status: string;
  created_at: string;
}

const PRODUCE_BATCH = 8; // matches the API cap per request

/**
 * Mass-generate a backlog of fresh SOP ideas, then mass-select and mass-produce
 * full SOPs from them — or dismiss. Generation excludes existing SOPs + every
 * prior suggestion, so an idea is never proposed twice. Global library only.
 */
export function SopSuggestions({ clientId, initial }: { clientId: string | null; initial: SopSuggestion[] }) {
  const router = useRouter();
  const [items, setItems] = useState<SopSuggestion[]>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [generating, setGenerating] = useState(false);
  const [producing, setProducing] = useState(false);

  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));
  const toggleSelect = (id: string) => setSelected((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((s) => s.id)));

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
    const prev = items;
    setItems((p) => p.filter((s) => s.id !== id));
    setSelected((p) => { const n = new Set(p); n.delete(id); return n; });
    try {
      // Default error toast on — if this fails (e.g. table not migrated yet) the
      // user sees why, and we restore the idea instead of a silent vanish-then-return.
      await api.patch(ROUTES.sopSuggestions(), { id, status: "dismissed" });
    } catch {
      setItems(prev);
    }
  }

  async function clearAll() {
    if (!items.length) return;
    if (!confirm(`Delete all ${items.length} idea${items.length !== 1 ? "s" : ""} from the backlog?`)) return;
    const prev = items;
    const ids = items.map((s) => s.id);
    setItems([]);
    setSelected(new Set());
    try {
      await api.patch(ROUTES.sopSuggestions(), { ids, status: "dismissed" });
      toast.success("Backlog cleared.");
    } catch {
      setItems(prev);
    }
  }

  async function createFrom(s: SopSuggestion) {
    setItems((p) => p.filter((x) => x.id !== s.id));
    try { await api.patch(ROUTES.sopSuggestions(), { id: s.id, status: "created" }, { showErrorToast: false }); } catch { /* ignore */ }
    const params = new URLSearchParams({ scope: "global", title: s.title });
    if (s.category) params.set("category", s.category);
    router.push(`/sops/new?${params.toString()}`);
  }

  // Generate full SOPs for every selected idea, in batches.
  async function produceSelected() {
    const ids = Array.from(selected);
    if (!ids.length || producing) return;
    setProducing(true);
    try {
      let total = 0;
      for (let i = 0; i < ids.length; i += PRODUCE_BATCH) {
        const batch = ids.slice(i, i + PRODUCE_BATCH);
        const res = await api.post<{ created: number; producedIds: string[] }>(
          ROUTES.sopSuggestionsProduce(), { clientId, ids: batch }, { showErrorToast: false },
        );
        total += res.created;
        const done = new Set(res.producedIds);
        setItems((p) => p.filter((s) => !done.has(s.id)));
        setSelected((p) => { const n = new Set(p); res.producedIds.forEach((id) => n.delete(id)); return n; });
      }
      toast.success(total > 0 ? `Produced ${total} SOP${total !== 1 ? "s" : ""} — they're in the library below.` : "Nothing was produced.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't produce the SOPs.");
    } finally {
      setProducing(false);
    }
  }

  return (
    <div className="surface-card p-4 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="label-section flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-400" /> SOP idea backlog</p>
        <span className="text-xs text-zinc-500">{items.length} open</span>
        {items.length > 0 && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
            <Trash2 className="w-3.5 h-3.5" /> Clear all
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className="bg-zinc-800 border-zinc-700 h-8 text-sm w-44" disabled={generating || producing} />
          <Button size="sm" onClick={generate} disabled={generating || producing} className="gap-1.5">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate ideas
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 mt-3 mb-1">
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-amber-500" disabled={producing} />
              Select all
            </label>
            <span className="text-xs text-zinc-600">{selected.size} selected</span>
            <Button
              size="sm"
              onClick={produceSelected}
              disabled={producing || selected.size === 0}
              className="gap-1.5 ml-auto"
            >
              {producing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
              {producing ? "Producing…" : `Produce ${selected.size || ""} selected`}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((s) => (
              <div key={s.id} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  disabled={producing}
                  className="accent-amber-500 mt-1 shrink-0"
                  aria-label={`Select ${s.title}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{s.title}</p>
                  {s.scope && <p className="text-xs text-zinc-500 mt-0.5">{s.scope}</p>}
                  <p className="text-[11px] text-zinc-600 mt-0.5">{s.category ? `${s.category} · ` : ""}{s.step_count ?? 6} steps</p>
                </div>
                <button onClick={() => createFrom(s)} disabled={producing} className="text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 shrink-0 mt-0.5 disabled:opacity-50">
                  <Wand2 className="w-3.5 h-3.5" /> Create
                </button>
                <button onClick={() => dismiss(s.id)} disabled={producing} title="Delete — never suggest this again" className="text-zinc-500 hover:text-red-400 shrink-0 mt-0.5 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-600 mt-2">“Produce” writes full SOPs for the selected ideas and saves them as public — edit or restrict them afterwards. Up to {PRODUCE_BATCH} per batch.</p>
        </>
      ) : (
        <p className="text-xs text-zinc-500 mt-2">Generate a batch of fresh SOP ideas — already-created and dismissed ones never come back.</p>
      )}
    </div>
  );
}
