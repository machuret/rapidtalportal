"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, Pin, PinOff, Eye, EyeOff, Trash2, ThumbsUp, Ban, Scale, Check, X, ChevronDown, ChevronUp, GitMerge } from "lucide-react";
import type { BrainMemoryScope } from "@/supabase/functions/_shared/brain-memory-scope";

export interface BrainMemoryItem {
  id: string;
  kind: "preference" | "anti_pattern" | "rule";
  content: string;
  confidence: number;
  source_count: number;
  active: boolean;
  pinned: boolean;
  status?: "proposed" | "active" | "muted" | "review_required";
  scope?: BrainMemoryScope | null;
  created_at: string;
  first_observed_at?: string;
  last_confirmed_at?: string;
  approved_at?: string | null;
  approved_by_user?: { id: string; full_name?: string | null; email?: string | null } | null;
  contradiction_status?: "none" | "open" | "resolved";
  conflict_summary?: string | null;
  lineage_complete?: boolean;
  conflicting_memory?: Pick<BrainMemoryItem, "id" | "content" | "scope"> | null;
  sources?: Array<{
    signal_id: string;
    contribution: "support" | "contradict";
    supporting_excerpt: string;
    supporting_excerpt_hash: string;
    created_at: string;
    signal?: {
      surface?: string;
      context?: Record<string, unknown>;
      created_at?: string;
      user_id?: string | null;
    } | null;
  }>;
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
export function BrainMemoryPanel({
  clientId,
  initial,
  pendingSignals = 0,
}: {
  clientId: string;
  initial: BrainMemoryItem[];
  pendingSignals?: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<BrainMemoryItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    api.get<BrainMemoryItem[]>(`${ROUTES.brain.memory()}?client_id=${encodeURIComponent(clientId)}`, {
      showErrorToast: false,
    }).then((data) => {
      if (!cancelled) setItems(data);
    }).catch(() => {
      // The server-rendered summary remains usable if the detail request fails.
    });
    return () => { cancelled = true; };
  }, [clientId]);

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

  async function patch(id: string, body: { pinned?: boolean; status?: "proposed" | "active" | "muted" | "review_required" }) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...body, ...(body.status ? { active: body.status === "active", status: body.status } : {}) } : x)));
    try {
      await api.patch(ROUTES.brain.memory(), { client_id: clientId, id, ...body });
    } catch {
      setItems(prev); // api-client already toasted
    }
  }

  async function resolveConflict(
    memory: BrainMemoryItem,
    action: "keep_existing" | "replace_existing" | "merge" | "narrow" | "keep_both",
  ) {
    let resolution: Record<string, unknown> = {};
    if (action === "merge") {
      const content = window.prompt(
        "Write the single merged lesson:",
        memory.conflicting_memory
          ? `${memory.conflicting_memory.content} ${memory.content}`
          : memory.content,
      );
      if (!content?.trim()) return;
      resolution = { content: content.trim(), scope: memory.scope ?? { surfaces: ["content"] } };
    }
    if (action === "narrow" || action === "keep_both") {
      const existingChannel = window.prompt("Channel for the existing lesson (for example linkedin):");
      const proposedChannel = window.prompt("Channel for the new lesson (for example newsletter):");
      if (!existingChannel?.trim() || !proposedChannel?.trim()) return;
      resolution = {
        existingScope: {
          ...(memory.conflicting_memory?.scope ?? { surfaces: ["content"] }),
          channels: [existingChannel.trim().toLocaleLowerCase()],
        },
        proposedScope: {
          ...(memory.scope ?? { surfaces: ["content"] }),
          channels: [proposedChannel.trim().toLocaleLowerCase()],
        },
      };
    }
    setBusy(true);
    try {
      await api.patch(ROUTES.brain.memory(), {
        client_id: clientId,
        id: memory.id,
        conflict_action: action,
        resolution,
      });
      toast.success("Memory conflict resolved.");
      const refreshed = await api.get<BrainMemoryItem[]>(
        `${ROUTES.brain.memory()}?client_id=${encodeURIComponent(clientId)}`,
      );
      setItems(refreshed);
    } finally {
      setBusy(false);
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

  const proposed = items.filter((m) => m.status === "proposed" || m.status === "review_required");
  const settled = items.filter((m) => m.status !== "proposed" && m.status !== "review_required");

  function Row({ m, proposedRow }: { m: BrainMemoryItem; proposedRow?: boolean }) {
    const meta = KIND_META[m.kind];
    const Icon = meta.icon;
    const scopeBadges = [
      ...(m.scope?.global ? ["global"] : []),
      ...(m.scope?.surfaces ?? []),
      ...(m.scope?.channels ?? []),
      ...(m.scope?.contentTypes ?? []),
      ...(m.scope?.audiences ?? []).map((entry) => `audience: ${entry}`),
      ...(m.scope?.objectives ?? []).map((entry) => `objective: ${entry}`),
    ];
    const conflict = m.status === "review_required" && m.contradiction_status === "open";
    const expanded = expandedId === m.id;
    return (
      <li className={`rounded-lg border px-3 py-2.5 ${
        proposedRow ? "border-amber-500/40 bg-amber-500/5"
        : m.active ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/60 bg-zinc-900/20 opacity-60"}`}>
        <div className="flex items-start gap-3">
          <span className={`inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.cls}`}>
            <Icon className="w-3 h-3" /> {meta.label}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 leading-relaxed">{m.content}</p>
            {scopeBadges.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {scopeBadges.map((scope) => <span key={scope} className="text-3xs text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{scope}</span>)}
              </div>
            )}
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : m.id)}
              className="mt-2 inline-flex items-center gap-1 text-2xs text-zinc-500 hover:text-zinc-300"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {m.source_count} exact signal{m.source_count === 1 ? "" : "s"} · evidence and history
            </button>
          </div>
          <span className="text-2xs text-zinc-600 shrink-0 mt-0.5" title="Confidence">{m.confidence}%</span>
          <div className="flex items-center gap-1 shrink-0">
            {proposedRow && !conflict ? (
              <>
                <button onClick={() => patch(m.id, { status: "active" })} aria-label="Approve and apply lesson" title="Approve — start applying" className="p-1 rounded text-green-400 hover:bg-zinc-800"><Check className="w-4 h-4" /></button>
                <button onClick={() => remove(m.id)} aria-label="Dismiss proposed lesson" title="Dismiss" className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800"><X className="w-4 h-4" /></button>
              </>
            ) : !proposedRow ? (
              <>
                <button onClick={() => patch(m.id, { pinned: !m.pinned })} aria-label={m.pinned ? "Unpin lesson" : "Pin lesson"} title={m.pinned ? "Unpin" : "Pin"} className={`p-1 rounded hover:bg-zinc-800 ${m.pinned ? "text-amber-400" : "text-zinc-500 hover:text-amber-400"}`}>
                  {m.pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => patch(m.id, { status: m.active ? "muted" : "active" })} aria-label={m.active ? "Mute lesson" : "Reactivate lesson"} title={m.active ? "Mute (stop applying)" : "Reactivate"} className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800">
                  {m.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => remove(m.id)} aria-label="Delete lesson" title="Delete" className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {conflict && (
          <div className="mt-3 rounded-md border border-amber-500/25 bg-zinc-950/40 p-3">
            <p className="text-xs font-medium text-amber-300">Conflicting feedback needs a decision</p>
            <p className="mt-1 text-xs text-zinc-400">
              {m.conflict_summary ?? "The new lesson conflicts with an approved lesson."}
            </p>
            {m.conflicting_memory && (
              <p className="mt-2 text-xs text-zinc-300">
                <span className="text-zinc-500">Existing:</span> {m.conflicting_memory.content}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveConflict(m, "keep_existing")}>Keep existing</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveConflict(m, "replace_existing")}>Replace</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveConflict(m, "merge")}><GitMerge className="mr-1 h-3.5 w-3.5" />Merge</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveConflict(m, "narrow")}>Narrow scopes</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveConflict(m, "keep_both")}>Keep both by scope</Button>
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
            <div className="grid gap-1 sm:grid-cols-2">
              <p>First observed: {m.first_observed_at ? new Date(m.first_observed_at).toLocaleString() : "Legacy date unavailable"}</p>
              <p>Last confirmed: {m.last_confirmed_at ? new Date(m.last_confirmed_at).toLocaleString() : "Not confirmed"}</p>
              <p>Approved by: {m.approved_by_user?.full_name || m.approved_by_user?.email || (m.approved_at ? "Known administrator" : "Not approved")}</p>
              <p>Lineage: {m.lineage_complete ? "Exact" : "Legacy evidence unavailable"}</p>
            </div>
            {(m.sources ?? []).length > 0 && (
              <ul className="mt-2 space-y-2">
                {(m.sources ?? []).map((source) => (
                  <li key={`${source.signal_id}:${source.contribution}`} className="rounded bg-zinc-950/50 px-2 py-1.5">
                    <span className={source.contribution === "contradict" ? "text-red-300" : "text-green-300"}>
                      {source.contribution === "contradict" ? "Contradicting" : "Supporting"}
                    </span>
                    {" · "}{source.signal?.surface ?? "unknown surface"}{" · "}
                    {source.signal?.created_at ? new Date(source.signal.created_at).toLocaleDateString() : "unknown date"}
                    <p className="mt-1 text-zinc-300">{source.supporting_excerpt}</p>
                    <p className="mt-1 font-mono text-3xs text-zinc-600">{source.supporting_excerpt_hash.slice(0, 16)}…</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
        Lessons distilled from your 👍/👎 feedback. Each lesson shows where it applies — pin the important ones, mute or delete anything off.
      </p>
      {pendingSignals > 0 && (
        <p className="mb-4 rounded-lg border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-xs text-blue-200">
          {pendingSignals} feedback signal{pendingSignals === 1 ? " is" : "s are"} waiting to be distilled into a proposed lesson.
        </p>
      )}

      {/* Proposed — needs your OK before the Brain applies them */}
      {proposed.length > 0 && (
        <div className="mb-4">
          <p className="label-section text-amber-400 mb-2">Review before applying ({proposed.length})</p>
          <ul className="flex flex-col gap-2">
            {proposed.map((m) => <Row key={m.id} m={m} proposedRow />)}
          </ul>
        </div>
      )}

      {settled.length === 0 && proposed.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {pendingSignals > 0
            ? "No lessons have been created yet. Run “Distill now” to process the waiting feedback."
            : "No feedback lessons yet. Give feedback on an answer or idea, then run “Distill now” to create reviewable lessons."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {settled.map((m) => <Row key={m.id} m={m} />)}
        </ul>
      )}
    </section>
  );
}
