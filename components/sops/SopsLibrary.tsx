"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Sop } from "@/app/(portal)/sops/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Search, Plus, ListChecks, ChevronRight, Tag, ArrowUpDown, GripVertical, Check } from "lucide-react";

interface SopUsage { runs: number; completions: number; users: number }

interface SopsLibraryProps {
  sops: Sop[];
  clientId: string;
  userId: string;
  canEdit: boolean;
  /** Where the "New SOP" button points (admin library passes ?scope=global). */
  newHref?: string;
  /** Optional per-SOP usage stats (admin library shows adoption). */
  usage?: Record<string, SopUsage>;
}

const catKey = (s: Sop) => s.category || "General";

function groupByCategory(list: Sop[]): { order: string[]; groups: Record<string, Sop[]> } {
  const order: string[] = [];
  const groups: Record<string, Sop[]> = {};
  for (const s of list) {
    const k = catKey(s);
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(s);
  }
  return { order, groups };
}

// Sub-group a category's SOPs by subcategory (preserving order). "" = no
// subcategory; those render directly under the category with no sub-heading.
function groupBySubcategory(list: Sop[]): { order: string[]; groups: Record<string, Sop[]> } {
  const order: string[] = [];
  const groups: Record<string, Sop[]> = {};
  for (const s of list) {
    const k = (s.subcategory ?? "").trim();
    if (!(k in groups)) { groups[k] = []; order.push(k); }
    groups[k].push(s);
  }
  // Un-subcategorised first, then named subcategories.
  order.sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  return { order, groups };
}

function stepCountOf(body: string): number {
  return body.split("\n").filter((l) => /^(step\s*\d+|\d+[.):])/i.test(l.trim())).length;
}

export function SopsLibrary({ sops, canEdit, newHref = "/sops/new", usage }: SopsLibraryProps) {
  const [search, setSearch] = useState("");
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState<Sop[]>(sops);
  const dragSrc = useRef<{ category: string; index: number } | null>(null);

  // Keep local order in sync with props except while actively reordering.
  useEffect(() => { if (!reordering) setOrder(sops); }, [sops, reordering]);

  const q = search.toLowerCase();
  const filtered = reordering
    ? order
    : sops.filter((s) => !q || s.title.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.body.toLowerCase().includes(q));

  const { order: catOrder, groups } = groupByCategory(filtered);

  const lastUpdated = sops.length > 0 ? new Date(Math.max(...sops.map((s) => new Date(s.updated_at).getTime()))) : null;

  function moveWithin(category: string, from: number, to: number) {
    if (from === to) return;
    setOrder((prev) => {
      const g = groupByCategory(prev);
      const moved = [...g.groups[category]];
      const [m] = moved.splice(from, 1);
      moved.splice(to, 0, m);
      g.groups[category] = moved.map((s, i) => ({ ...s, order_index: i }));
      void api
        .post(ROUTES.sopReorder(), { items: g.groups[category].map((s) => ({ id: s.id, order_index: s.order_index })) }, { showErrorToast: false })
        .then(() => toast.success("Order saved."))
        .catch(() => toast.error("Couldn't save order."));
      return g.order.flatMap((k) => g.groups[k]);
    });
  }

  // One SOP row — reorder handle variant or the clickable link. `idx` is the
  // position within its (reorder) category group, used for drag targeting.
  function renderSopRow(sop: Sop, category: string, idx: number) {
    const stepCount = stepCountOf(sop.body);
    const meta = (
      <p className="text-sm text-zinc-500 mt-0.5">
        {stepCount > 0 ? `${stepCount} step${stepCount !== 1 ? "s" : ""}` : "View procedure"}
        {" · "}Updated {new Date(sop.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        {usage?.[sop.id] && (
          <span className="text-zinc-400">
            {" · "}{usage[sop.id].runs} run{usage[sop.id].runs !== 1 ? "s" : ""}
            {usage[sop.id].completions > 0 && `, ${usage[sop.id].completions} completed`}
            {usage[sop.id].users > 0 && ` · ${usage[sop.id].users} VA${usage[sop.id].users !== 1 ? "s" : ""}`}
          </span>
        )}
      </p>
    );
    const titleRow = (
      <div className="flex items-center gap-2">
        <p className="font-semibold text-base text-zinc-100 group-hover:text-white transition-colors">{sop.title}</p>
        {sop.client_id === null && <span className="text-[10px] font-medium uppercase tracking-wide text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-1.5 py-0.5 shrink-0">Library</span>}
      </div>
    );

    if (reordering) {
      return (
        <div
          key={sop.id}
          draggable
          onDragStart={() => { dragSrc.current = { category, index: idx }; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const src = dragSrc.current;
            if (src && src.category === category) moveWithin(category, src.index, idx);
            dragSrc.current = null;
          }}
          className="surface-card flex items-center gap-3 px-5 py-4 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />
          <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
            <ListChecks className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">{titleRow}{meta}</div>
        </div>
      );
    }

    return (
      <Link
        key={sop.id}
        href={`/sops/${sop.id}`}
        className="surface-card group flex items-center gap-4 px-5 py-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all"
      >
        <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
          <ListChecks className="w-4.5 h-4.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">{titleRow}{meta}</div>
        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
      </Link>
    );
  }

  return (
    <div>
      {sops.length > 0 && (
        <div className="flex gap-4 mb-6 text-sm text-zinc-500">
          <span><span className="text-zinc-200 font-semibold">{sops.length}</span> procedure{sops.length !== 1 ? "s" : ""}</span>
          <span className="text-zinc-700">&middot;</span>
          <span><span className="text-zinc-200 font-semibold">{catOrder.length || Object.keys(groupByCategory(sops).groups).length}</span> categories</span>
          {lastUpdated && (
            <>
              <span className="text-zinc-700">&middot;</span>
              <span>Last updated <span className="text-zinc-200">{lastUpdated.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></span>
            </>
          )}
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SOPs…"
            disabled={reordering}
            className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 disabled:opacity-50"
          />
        </div>
        {canEdit && sops.length > 1 && (
          <Button size="sm" variant={reordering ? "default" : "outline"} onClick={() => setReordering((v) => !v)} className="gap-1.5 border-zinc-700">
            {reordering ? <><Check className="w-4 h-4" /> Done</> : <><ArrowUpDown className="w-4 h-4" /> Reorder</>}
          </Button>
        )}
        {canEdit && !reordering && (
          <Link href={newHref}>
            <Button size="sm"><Plus className="w-4 h-4" /> New SOP</Button>
          </Link>
        )}
      </div>

      {reordering && (
        <p className="text-xs text-zinc-500 mb-4">Drag the handle to reorder SOPs within a category. Changes save automatically.</p>
      )}

      {catOrder.length === 0 ? (
        <div className="surface-card p-16 text-center">
          <ListChecks className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-semibold text-lg mb-1">{sops.length === 0 ? "No SOPs yet" : "No results"}</p>
          <p className="text-zinc-500 text-sm mb-5">
            {sops.length === 0
              ? canEdit ? "Create your first Standard Operating Procedure." : "No procedures have been created yet — contact your admin."
              : `No procedures match "${search}".`}
          </p>
          {sops.length === 0 && canEdit && (
            <Link href={newHref}><Button variant="outline" size="sm"><Plus className="w-4 h-4" /> Create first SOP</Button></Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {catOrder.map((category) => {
            const items = groups[category];
            const sub = groupBySubcategory(items);
            // Sub-group by subcategory in normal mode; flat list while reordering
            // (drag indices must match the category's flat order).
            const showSub = !reordering && sub.order.some((s) => s !== "");
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <p className="label-section text-amber-400">{category}</p>
                  <span className="text-xs text-zinc-600 ml-1">({items.length})</span>
                </div>
                {showSub ? (
                  <div className="flex flex-col gap-4">
                    {sub.order.map((subname) => (
                      <div key={subname || "_none"}>
                        {subname && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5 ml-0.5">{subname}</p>
                        )}
                        <div className="flex flex-col gap-2">
                          {sub.groups[subname].map((sop, idx) => renderSopRow(sop, category, idx))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((sop, idx) => renderSopRow(sop, category, idx))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
