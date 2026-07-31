"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  Check,
  Clock3,
  FilePenLine,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button, buttonVariants } from "@/components/ui/button";
import type { BrainMemoryItem } from "./BrainMemoryPanel";

interface LearningSuggestion {
  id: string;
  piece_id: string;
  classification: string;
  proposed_outcome: string;
  dimensions: string[];
  summary: string;
  lesson_content: string;
  explanation: string;
  before_excerpt: string;
  after_excerpt: string;
  proposed_scope: Record<string, unknown>;
  confidence: number;
  status: string;
  created_at: string;
  content_pieces?: { title?: string; content_type?: string } | Array<{ title?: string; content_type?: string }> | null;
}

function destination(outcome: string): { label: string; href?: string } {
  if (outcome === "company_dna_update") return { label: "Company DNA correction", href: "/company-dna" };
  if (outcome === "vault_correction") return { label: "Vault correction", href: "/vault" };
  if (outcome === "channel_style_update") return { label: "Channel-style update", href: "/content?tab=style" };
  if (outcome === "brain_anti_pattern") return { label: "Brain anti-pattern" };
  if (outcome === "brain_preference") return { label: "Brain preference" };
  return { label: "No reusable learning" };
}

export function BrainLearningInbox({
  clientId,
  memories,
}: {
  clientId: string;
  memories: BrainMemoryItem[];
}) {
  const [items, setItems] = useState<LearningSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.get<LearningSuggestion[]>(
        ROUTES.brain.learningInboxForClient(clientId),
        { showErrorToast: false },
      );
      setItems(rows);
    } catch {
      setError("The Brain learning inbox could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.patch(ROUTES.brain.learningInbox(), {
        client_id: clientId,
        id,
        action,
      });
      setItems((current) => current.map((item) =>
        item.id === id ? { ...item, status: action === "approve" ? "approved" : "rejected" } : item
      ));
      toast.success(action === "approve" ? "Learning approved and routed." : "Learning suggestion rejected.");
    } finally {
      setBusyId(null);
    }
  }

  const reviewItems = items.filter((item) => item.status === "pending" || item.status === "proposed");
  const insights = useMemo(() => {
    const now = Date.now();
    return {
      conflicts: memories.filter((memory) => memory.status === "review_required"),
      stale: memories.filter((memory) => {
        const confirmed = Date.parse(memory.last_confirmed_at ?? memory.created_at);
        return memory.active && Number.isFinite(confirmed) && now - confirmed > 90 * 86_400_000;
      }),
      lowConfidence: memories.filter((memory) => memory.confidence < 55 && memory.status !== "muted"),
      reinforced: memories.filter((memory) => {
        const confirmed = Date.parse(memory.last_confirmed_at ?? "");
        return Number.isFinite(confirmed) && now - confirmed < 30 * 86_400_000 && memory.source_count > 1;
      }),
    };
  }, [memories]);

  return (
    <section className="surface-card mb-8 p-6" aria-labelledby="brain-learning-inbox-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="brain-learning-inbox-title" className="flex items-center gap-2 text-lg font-semibold text-white">
            <Brain className="h-5 w-5 text-purple-400" /> Brain learning inbox
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Deliberate editorial lessons and corrections waiting for a human decision.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["New", reviewItems.length],
          ["Conflicts", insights.conflicts.length],
          ["Style/DNA", reviewItems.filter((item) => ["channel_style_update", "company_dna_update", "vault_correction"].includes(item.proposed_outcome)).length],
          ["Stale/low", new Set([...insights.stale, ...insights.lowConfidence].map((item) => item.id)).size],
          ["Reinforced", insights.reinforced.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-200">
          {error} <button type="button" className="underline" onClick={() => void load()}>Retry</button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-zinc-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading learning suggestions…
        </div>
      ) : reviewItems.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-800 p-6 text-center">
          <p className="text-sm text-zinc-400">No editorial learning needs review.</p>
          <p className="mt-1 text-xs text-zinc-600">Meaningful manual edits will appear here only when an editor chooses to teach the Brain.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviewItems.map((item) => {
            const target = destination(item.proposed_outcome);
            const piece = Array.isArray(item.content_pieces) ? item.content_pieces[0] : item.content_pieces;
            return (
              <li key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-purple-500/25 bg-purple-500/10 px-2 py-0.5 text-2xs text-purple-200">
                        {target.label}
                      </span>
                      {piece?.content_type && <span className="text-2xs text-zinc-500">{piece.content_type}</span>}
                      {piece?.title && <span className="truncate text-2xs text-zinc-600">{piece.title}</span>}
                    </div>
                    <p className="mt-2 text-sm font-medium text-zinc-200">{item.summary}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{item.explanation}</p>
                    {!["company_dna_update", "vault_correction"].includes(item.proposed_outcome) && (
                      <p className="mt-2 rounded-lg bg-purple-500/5 px-3 py-2 text-xs text-purple-100">
                        Proposed instruction: {item.lesson_content}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.dimensions.map((dimension) => (
                        <span key={dimension} className="rounded bg-zinc-800 px-1.5 py-0.5 text-2xs text-zinc-500">
                          {dimension.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                    <details className="mt-3 text-xs text-zinc-500">
                      <summary className="cursor-pointer">Show the exact change</summary>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2">
                        <div className="rounded bg-zinc-900 p-2"><span className="text-zinc-600">Before</span><p className="mt-1 text-zinc-400">{item.before_excerpt}</p></div>
                        <div className="rounded bg-zinc-900 p-2"><span className="text-zinc-600">After</span><p className="mt-1 text-zinc-300">{item.after_excerpt}</p></div>
                      </div>
                    </details>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {target.href && (
                      <Link href={target.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        {item.proposed_outcome === "channel_style_update"
                          ? <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                          : <FilePenLine className="mr-1.5 h-3.5 w-3.5" />}
                        Open destination
                      </Link>
                    )}
                    <Button size="sm" disabled={!!busyId} onClick={() => review(item.id, "approve")}>
                      {busyId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!!busyId} onClick={() => review(item.id, "reject")}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(insights.conflicts.length > 0 || insights.stale.length > 0 || insights.lowConfidence.length > 0) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ReviewSummary icon={AlertTriangle} label="Conflicting lessons" count={insights.conflicts.length} />
          <ReviewSummary icon={Clock3} label="Stale lessons" count={insights.stale.length} />
          <ReviewSummary icon={AlertTriangle} label="Low-confidence lessons" count={insights.lowConfidence.length} />
        </div>
      )}
    </section>
  );
}

function ReviewSummary({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof AlertTriangle;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
      <Icon className="h-3.5 w-3.5 text-amber-400" />
      <span>{label}</span>
      <span className="ml-auto font-semibold text-white">{count}</span>
    </div>
  );
}
