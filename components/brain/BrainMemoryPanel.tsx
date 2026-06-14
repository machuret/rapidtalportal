"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, Pin, PinOff, Eye, EyeOff, Trash2, ThumbsUp, Ban, Scale } from "lucide-react";

export interface BrainMemoryItem {
  id: string;
  kind: "preference" | "anti_pattern" | "rule";
  content: string;
  confidence: number;
  source_count: number;
  active: boolean;
  pinned: boolean;
  created_at: string;
}

const KIND_META: Record<BrainMemoryItem["kind"], { label: string; icon: typeof ThumbsUp; cls: string }> = {
  preference:   { label: "Prefer", icon: ThumbsUp, cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  anti_pattern: { label: "Avoid",  icon: Ban,      cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  rule:         { label: "Rule",   icon: Scale,    cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

/**
 * The Brain's learned memory — distilled from feedback. Admins can pin, mute, or
 * delete a lesson, and trigger a fresh distillation. Active lessons are injected
 * into every generation, so this panel makes the learning transparent and
 * correctable.
 */
export function BrainMemoryPanel({ clientId, initial }: { clientId: string; initial: BrainMemoryItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<BrainMemoryItem[]>(initial);
  const [busy, setBusy] = useState(false);

  async function distill() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post<{ skipped: boolean; reason?: string; newMemories: number; processedSignals: number }>(
        ROUTES.brain.memoryDistill(), { client_id: clientId }
      );
      if (r.skipped) toast.message(r.reason ?? "Nothing new to learn yet.");
      else toast.success(`Learned ${r.newMemories} new lesson${r.newMemories === 1 ? "" : "s"} from ${r.processedSignals} signal${r.processedSignals === 1 ? "" : "s"}.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Partial<Pick<BrainMemoryItem, "active" | "pinned">>) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...body } : x)));
    try {
      await api.patch(ROUTES.brain.memory(), { client_id: clientId, id, ...body });
    } catch {
      setItems(prev); // api-client already toasted
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this learned lesson? The Brain will stop applying it.")) return;
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    try {
      await api.delete(ROUTES.brain.memory(), { client_id: clientId, id });
      toast.success("Lesson deleted.");
    } catch {
      setItems(prev);
    }
  }

  return (
    <section className="surface-card p-6 mt-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">What the Brain has learned</h2>
        </div>
        <Button size="sm" onClick={distill} disabled={busy} className="gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          {busy ? "Distilling…" : "Distill now"}
        </Button>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Lessons distilled from your 👍/👎 feedback. Active lessons steer every topic and draft the AI produces — pin the important ones, mute or delete anything off.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing learned yet. As you thumb topics up or flag ones that don&apos;t make sense, then run “Distill now”, the Brain&apos;s lessons appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((m) => {
            const meta = KIND_META[m.kind];
            const Icon = meta.icon;
            return (
              <li
                key={m.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${m.active ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/60 bg-zinc-900/20 opacity-60"}`}
              >
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.cls}`}>
                  <Icon className="w-3 h-3" /> {meta.label}
                </span>
                <p className="text-sm text-zinc-200 leading-relaxed flex-1 min-w-0">{m.content}</p>
                <span className="text-[11px] text-zinc-600 shrink-0 mt-0.5" title="Confidence">{m.confidence}%</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => patch(m.id, { pinned: !m.pinned })} title={m.pinned ? "Unpin" : "Pin"} className={`p-1 rounded hover:bg-zinc-800 ${m.pinned ? "text-amber-400" : "text-zinc-500 hover:text-amber-400"}`}>
                    {m.pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => patch(m.id, { active: !m.active })} title={m.active ? "Mute (stop applying)" : "Reactivate"} className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800">
                    {m.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => remove(m.id)} title="Delete" className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
