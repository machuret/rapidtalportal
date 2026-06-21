"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, Pin, PinOff, Eye, EyeOff, Trash2, ThumbsUp, Ban, Scale, Check, X } from "lucide-react";

export interface BrainMemoryItem {
  id: string;
  kind: "preference" | "anti_pattern" | "rule";
  content: string;
  confidence: number;
  source_count: number;
  active: boolean;
  pinned: boolean;
  status?: "proposed" | "active" | "muted";
  scope?: { surfaces?: string[] } | null;
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
      const r = await api.post<{ skipped: boolean; reason?: string; newMemories: number; processedSignals: number; reinforced?: number; proposed?: number }>(
        ROUTES.brain.memoryDistill(), { client_id: clientId }
      );
      if (r.skipped) toast.message(r.reason ?? "Nothing new to learn yet.");
      else {
        const bits = [
          r.newMemories ? `learned ${r.newMemories}` : "",
          r.reinforced ? `reinforced ${r.reinforced}` : "",
          r.proposed ? `${r.proposed} to review` : "",
        ].filter(Boolean);
        toast.success(bits.length ? `From ${r.processedSignals} signal${r.processedSignals === 1 ? "" : "s"}: ${bits.join(", ")}.` : `Processed ${r.processedSignals} signals — nothing new.`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: { pinned?: boolean; status?: "proposed" | "active" | "muted" }) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...body, ...(body.status ? { active: body.status === "active", status: body.status } : {}) } : x)));
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

  const proposed = items.filter((m) => m.status === "proposed");
  const settled = items.filter((m) => m.status !== "proposed");

  function Row({ m, proposedRow }: { m: BrainMemoryItem; proposedRow?: boolean }) {
    const meta = KIND_META[m.kind];
    const Icon = meta.icon;
    const scopes = m.scope?.surfaces ?? [];
    return (
      <li className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
        proposedRow ? "border-amber-500/40 bg-amber-500/5"
        : m.active ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/60 bg-zinc-900/20 opacity-60"}`}>
        <span className={`inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.cls}`}>
          <Icon className="w-3 h-3" /> {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-relaxed">{m.content}</p>
          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {scopes.map((s) => <span key={s} className="text-3xs text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{s}</span>)}
            </div>
          )}
        </div>
        <span className="text-2xs text-zinc-600 shrink-0 mt-0.5" title="Confidence">{m.confidence}%</span>
        <div className="flex items-center gap-1 shrink-0">
          {proposedRow ? (
            <>
              <button onClick={() => patch(m.id, { status: "active" })} title="Approve — start applying" className="p-1 rounded text-green-400 hover:bg-zinc-800"><Check className="w-4 h-4" /></button>
              <button onClick={() => remove(m.id)} title="Dismiss" className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800"><X className="w-4 h-4" /></button>
            </>
          ) : (
            <>
              <button onClick={() => patch(m.id, { pinned: !m.pinned })} title={m.pinned ? "Unpin" : "Pin"} className={`p-1 rounded hover:bg-zinc-800 ${m.pinned ? "text-amber-400" : "text-zinc-500 hover:text-amber-400"}`}>
                {m.pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => patch(m.id, { status: m.active ? "muted" : "active" })} title={m.active ? "Mute (stop applying)" : "Reactivate"} className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800">
                {m.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => remove(m.id)} title="Delete" className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </li>
    );
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
        Lessons distilled from your 👍/👎 feedback. Active lessons steer every topic, answer and draft — pin the important ones, mute or delete anything off.
      </p>

      {/* Proposed — needs your OK before the Brain applies them */}
      {proposed.length > 0 && (
        <div className="mb-4">
          <p className="label-section text-amber-400 mb-2">Proposed — approve to apply ({proposed.length})</p>
          <ul className="flex flex-col gap-2">
            {proposed.map((m) => <Row key={m.id} m={m} proposedRow />)}
          </ul>
        </div>
      )}

      {settled.length === 0 && proposed.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing learned yet. As you thumb things up or flag ones that don&apos;t make sense, then run “Distill now”, the Brain&apos;s lessons appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {settled.map((m) => <Row key={m.id} m={m} />)}
        </ul>
      )}
    </section>
  );
}
