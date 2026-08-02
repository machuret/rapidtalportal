"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Sop } from "@/types/sops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pencil, Trash2, Copy, Check, Save, X, ListChecks, Tag, Clock, Copy as CopyIcon, Loader2, Play, GitFork, Sparkles } from "lucide-react";
import { useSops } from "@/hooks/useSops";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { formatDate, formatNumber } from "@/lib/utils";

// (interface below) clientId may be null for global library SOPs.
interface Props {
  sop: Sop;
  canEdit: boolean;
  clientId: string | null; // null = global library SOP
  categories: string[];
  /** When set (viewing a Library SOP as a client admin), enables "Copy to my SOPs". */
  forkToClientId?: string | null;
}

export function SopDetail({ sop: initial, canEdit, clientId, categories, forkToClientId }: Props) {
  const router = useRouter();
  const [forking, setForking] = useState(false);

  async function fork() {
    if (forking) return;
    setForking(true);
    try {
      const res = await api.post<{ id: string }>(ROUTES.sopFork(), { sopId: initial.id });
      toast.success("Copied to your SOPs — customize it freely.");
      router.push(`/sops/${res.id}`);
      router.refresh();
    } catch {
      // api-client surfaces a toast
    } finally {
      setForking(false);
    }
  }

  const {
    updateSop,
    isUpdating: saving,
    deleteSop: deleteSopMutation,
    isDeleting: deleting,
    createSop,
    isCreating: duplicating,
  } = useSops(clientId);

  const [sop, setSop] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: sop.title, category: sop.category, body: sop.body });
  const [copied, setCopied] = useState(false);

  function setF(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const wordCount = useMemo(() => form.body.trim().split(/\s+/).filter(Boolean).length, [form.body]);
  const charCount = form.body.length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const updated = await updateSop({ id: sop.id, clientId, ...form });
      setSop(updated as Sop);
      setEditing(false);
      toast.success("SOP updated.");
    } catch {
      // Error toast handled by the API client.
    }
  }

  async function deleteSop() {
    if (!confirm("Delete this SOP permanently?")) return;
    try {
      await deleteSopMutation({ id: sop.id, clientId });
      toast.success("SOP deleted.");
      router.push("/sops");
      router.refresh();
    } catch {
      // Error toast handled by the API client.
    }
  }

  async function duplicate() {
    try {
      const created = await createSop({
        clientId,
        title:       `${sop.title} (Copy)`,
        category:    sop.category,
        subcategory: sop.subcategory ?? null,
        body:        sop.body,
        order_index: sop.order_index,
      });
      toast.success("SOP duplicated — opening copy.");
      router.push(`/sops/${(created as Sop).id}`);
      router.refresh();
    } catch {
      // Error toast handled by the API client.
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(sop.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Parse body into steps: detect "Step N" OR "N." OR "N)" at start of line
  const lines = sop.body.split("\n").filter(l => l.trim() !== "");
  const isStepFormat = lines.some(l => /^(step\s*\d+|\d+[.):])/i.test(l.trim()));

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit SOP</h1>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X className="w-4 h-4 mr-1.5" /> Cancel
          </Button>
        </div>
        <div className="surface-card px-6 py-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setF("title", e.target.value)} required className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={e => setF("category", e.target.value)}
                list="sop-categories-edit"
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
                placeholder="e.g. HR, Sales, Support"
              />
              <datalist id="sop-categories-edit">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Steps / Content</Label>
            <Textarea
              value={form.body}
              onChange={e => setF("body", e.target.value)}
              required
              rows={16}
              placeholder={"Step 1: ...\nStep 2: ...\nStep 3: ..."}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono text-sm leading-relaxed resize-y"
            />
            <p className="text-xs text-zinc-600 text-right">
              {formatNumber(wordCount)} words &middot; {formatNumber(charCount)} chars
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <ListChecks className="w-5 h-5 text-amber-400 shrink-0" />
            <h1 className="text-2xl font-bold leading-tight">{sop.title}</h1>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-0.5">
              <Tag className="w-3 h-3" /> {sop.category}{sop.subcategory ? ` › ${sop.subcategory}` : ""}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="w-3 h-3" /> Updated {formatDate(sop.updated_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/sops/${sop.id}/run`}>
            <Button size="sm" className="gap-1.5">
              <Play className="w-3.5 h-3.5" /> Run step-by-step
            </Button>
          </Link>
          {forkToClientId && (
            <Button variant="outline" size="sm" onClick={fork} disabled={forking} className="gap-1.5">
              {forking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
              Copy to my SOPs
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copy}>
            {copied
              ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied</>
              : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={duplicate} disabled={duplicating}>
                {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CopyIcon className="w-3.5 h-3.5" />}
                Duplicate
              </Button>
              <Link href={`/sops/${sop.id}/edit`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Edit in Studio
                </Button>
              </Link>
              <Link href={`/sops/${sop.id}/edit?improve=1`}>
                <Button variant="outline" size="sm" className="gap-1.5 border-amber-400/30 text-amber-300 hover:text-amber-200">
                  <Sparkles className="w-3.5 h-3.5" /> Improve with AI
                </Button>
              </Link>
              <Button variant="destructive" size="sm" onClick={deleteSop} disabled={deleting}>
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="surface-card px-6 py-6">
        {isStepFormat ? (
          <ol className="flex flex-col gap-5">
            {(() => {
              // Group: step lines get a number bubble; non-step lines are rendered as
              // indented sub-text under the most recent step (or as a preamble block).
              const items: { isStep: boolean; stepNum: number; label: string; content: string }[] = [];
              let stepNum = 0;
              for (const line of lines) {
                const stepMatch = line.match(/^(?:step\s*)?(?:(\d+)[.):]?)\s*(.*)/i);
                const isStep = /^(step\s*\d+|\d+[.):])/i.test(line.trim());
                if (isStep && stepMatch) {
                  stepNum++;
                  const rawLabel = line.match(/^(step\s*\d+[:]?|\d+[.):][:]?)/i)?.[1] ?? "";
                  const content = line.replace(/^(step\s*\d+[:]?|\d+[.):][:]?)\s*/i, "").trim();
                  items.push({ isStep: true, stepNum, label: rawLabel, content });
                } else {
                  items.push({ isStep: false, stepNum, label: "", content: line });
                }
              }
              return items.map((item, i) =>
                item.isStep ? (
                  <li key={i} className="flex gap-4">
                    <span className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {item.stepNum}
                    </span>
                    <div className="flex-1">
                      {item.label && <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-0.5">{item.label}</p>}
                      <p className="text-zinc-200 text-base leading-relaxed">{item.content}</p>
                    </div>
                  </li>
                ) : (
                  <li key={i} className={`flex gap-4 ${item.stepNum > 0 ? "pl-12" : ""}`}>
                    <p className="text-zinc-400 text-sm leading-relaxed italic">{item.content}</p>
                  </li>
                )
              );
            })()}
          </ol>
        ) : (
          <div className="whitespace-pre-wrap text-zinc-200 text-base leading-relaxed font-sans">
            {sop.body}
          </div>
        )}
      </div>
    </div>
  );
}
