"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import type {
  VaultGapImportance,
  VaultKnowledgeGap,
} from "@/lib/vault/readiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  Circle,
  Flag,
  GraduationCap,
  Link2,
  Loader2,
  UserPlus,
  X,
} from "lucide-react";

type GapInput = string | VaultKnowledgeGap;
type SourceOption = { id: string; title: string };

const importanceClasses: Record<VaultGapImportance, string> = {
  low: "border-zinc-700 bg-zinc-800 text-zinc-400",
  normal: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  high: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
};

function normalizeGap(gap: GapInput, index: number): VaultKnowledgeGap {
  if (typeof gap !== "string") return gap;
  return {
    id: `legacy-${index}-${gap}`,
    question: gap,
    status: "open",
    importance: "normal",
    ownerId: null,
    ownerName: null,
    recommendedSource: null,
    occurrences: 1,
    createdAt: "",
  };
}

export function KnowledgeGaps({ gaps, clientId, canCurate, onChanged }: {
  gaps: GapInput[];
  clientId: string;
  canCurate: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const normalized = useMemo(() => gaps.map(normalizeGap), [gaps]);
  const [answering, setAnswering] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [importance, setImportance] = useState<VaultGapImportance>("normal");
  const [recommendedSource, setRecommendedSource] = useState("");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  function identify(gap: VaultKnowledgeGap) {
    return gap.id.startsWith("legacy-")
      ? { question: gap.question }
      : { gapId: gap.id, question: gap.question };
  }

  function refresh() {
    onChanged?.();
    router.refresh();
  }

  async function teach(gap: VaultKnowledgeGap) {
    if (answer.trim().length < 3 || busy || !canCurate) return;
    setBusy(gap.id);
    try {
      await api.post(ROUTES.vault.teach(), {
        clientId,
        ...identify(gap),
        answer: answer.trim(),
      }, { showErrorToast: false });
      setDone((current) => new Set(current).add(gap.id));
      setAnswering(null);
      setAnswer("");
      toast.success("Gap resolved with an approved knowledge answer.");
      refresh();
    } catch (error) {
      toast.error(errorMessage(error, "The answer could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  async function runAction(
    gap: VaultKnowledgeGap,
    action: "dismiss" | "claim" | "update" | "resolve",
    extra: Record<string, unknown> = {},
  ) {
    if (busy || !canCurate) return;
    setBusy(gap.id);
    try {
      await api.post(ROUTES.vault.gaps(), {
        clientId,
        ...identify(gap),
        action,
        ...extra,
      }, { showErrorToast: false });
      if (action === "dismiss" || action === "resolve") {
        setDone((current) => new Set(current).add(gap.id));
      }
      setEditing(null);
      setLinking(null);
      toast.success(
        action === "dismiss"
          ? "Gap dismissed."
          : action === "claim"
            ? "Gap assigned to you."
            : action === "resolve"
              ? "Gap linked to an approved Vault source."
              : "Gap priorities updated.",
      );
      refresh();
    } catch (error) {
      toast.error(errorMessage(error, "The knowledge gap could not be updated."));
    } finally {
      setBusy(null);
    }
  }

  async function startLinking(gap: VaultKnowledgeGap) {
    setLinking(gap.id);
    setSelectedSourceId("");
    if (sources.length) return;
    setBusy(gap.id);
    try {
      const result = await api.get<{ items: SourceOption[] }>(
        `${ROUTES.vault.items()}?clientId=${clientId}&status=ready&evidenceRole=factual&knowledgeStatus=active&limit=50`,
        { showErrorToast: false },
      );
      setSources(result.items ?? []);
    } catch (error) {
      setLinking(null);
      toast.error(errorMessage(error, "Vault sources could not be loaded."));
    } finally {
      setBusy(null);
    }
  }

  const open = normalized.filter((gap) => !done.has(gap.id));
  if (open.length === 0) {
    return <p className="text-sm text-green-400">No open gaps. Recent questions are covered.</p>;
  }

  return (
    <ul className="space-y-3">
      {open.map((gap) => (
        <li key={gap.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-start gap-2.5">
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/70" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">{gap.question}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2 py-0.5 ${importanceClasses[gap.importance]}`}>
                  {gap.importance}
                </span>
                <span className="text-zinc-500">
                  {gap.ownerName ? `Owner: ${gap.ownerName}` : "Unassigned"}
                </span>
                {gap.occurrences > 1 && (
                  <span className="text-zinc-600">Asked {gap.occurrences} times</span>
                )}
                {gap.recommendedSource && (
                  <span className="text-zinc-500">Suggested: {gap.recommendedSource}</span>
                )}
              </div>
            </div>

            {canCurate && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {!gap.ownerId && (
                  <button
                    type="button"
                    onClick={() => void runAction(gap, "claim")}
                    disabled={busy === gap.id}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Own
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAnswering(answering === gap.id ? null : gap.id);
                    setAnswer("");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-blue-300"
                >
                  <GraduationCap className="h-3.5 w-3.5" /> Answer
                </button>
                <button
                  type="button"
                  onClick={() => void startLinking(gap)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-purple-300"
                >
                  <Link2 className="h-3.5 w-3.5" /> Link source
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(editing === gap.id ? null : gap.id);
                    setImportance(gap.importance);
                    setRecommendedSource(gap.recommendedSource ?? "");
                  }}
                  title="Set importance and suggested source"
                  className="p-1 text-zinc-600 hover:text-amber-300"
                >
                  <Flag className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void runAction(gap, "dismiss")}
                  disabled={busy === gap.id}
                  title="Dismiss as noise"
                  className="p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-50"
                >
                  {busy === gap.id && answering !== gap.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <X className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>

          {answering === gap.id && (
            <div className="mt-3 space-y-2 pl-6">
              <Textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                placeholder="Add an approved answer. It will be saved to the Knowledge Base and linked to this gap."
                className="border-zinc-700 bg-zinc-950/60 text-sm text-zinc-100"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void teach(gap)}
                  disabled={busy === gap.id || answer.trim().length < 3}
                  className="h-7 gap-1.5 text-xs"
                >
                  {busy === gap.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Check className="h-3 w-3" />}
                  Save approved answer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAnswering(null)} className="h-7 border-zinc-700 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {editing === gap.id && (
            <div className="mt-3 grid gap-2 pl-6 sm:grid-cols-[140px_1fr_auto]">
              <select
                value={importance}
                onChange={(event) => setImportance(event.target.value as VaultGapImportance)}
                className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200"
              >
                <option value="low">Low importance</option>
                <option value="normal">Normal importance</option>
                <option value="high">High importance</option>
                <option value="critical">Critical</option>
              </select>
              <Input
                value={recommendedSource}
                onChange={(event) => setRecommendedSource(event.target.value)}
                placeholder="What source should be added?"
                className="border-zinc-700 bg-zinc-950"
              />
              <Button
                size="sm"
                disabled={busy === gap.id}
                onClick={() => void runAction(gap, "update", {
                  importance,
                  recommendedSource: recommendedSource.trim() || null,
                })}
              >
                Save
              </Button>
            </div>
          )}

          {linking === gap.id && (
            <div className="mt-3 flex gap-2 pl-6">
              <select
                value={selectedSourceId}
                onChange={(event) => setSelectedSourceId(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200"
              >
                <option value="">Choose an active factual source…</option>
                {sources
                  .filter((source) => source.id !== gap.id)
                  .map((source) => (
                    <option key={source.id} value={source.id}>{source.title}</option>
                  ))}
              </select>
              <Button
                size="sm"
                disabled={!selectedSourceId || busy === gap.id}
                onClick={() => void runAction(gap, "resolve", { vaultItemId: selectedSourceId })}
              >
                Resolve with source
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
