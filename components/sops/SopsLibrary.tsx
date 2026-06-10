"use client";

import { useState } from "react";
import Link from "next/link";
import type { Sop } from "@/app/(portal)/sops/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, ListChecks, ChevronRight, Tag } from "lucide-react";

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

export function SopsLibrary({ sops, canEdit, newHref = "/sops/new", usage }: SopsLibraryProps) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase();
  const filtered = sops.filter(s =>
    !q ||
    s.title.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.body.toLowerCase().includes(q)
  );

  const grouped = filtered.reduce<Record<string, Sop[]>>((acc, s) => {
    const cat = s.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const lastUpdated = sops.length > 0
    ? new Date(Math.max(...sops.map(s => new Date(s.updated_at).getTime())))
    : null;

  return (
    <div>
      {/* Stats strip */}
      {sops.length > 0 && (
        <div className="flex gap-4 mb-6 text-sm text-zinc-500">
          <span><span className="text-zinc-200 font-semibold">{sops.length}</span> procedure{sops.length !== 1 ? "s" : ""}</span>
          <span className="text-zinc-700">&middot;</span>
          <span><span className="text-zinc-200 font-semibold">{Object.keys(sops.reduce<Record<string,boolean>>((a,s)=>({...a,[s.category||"General"]:true}),{})).length}</span> categor{sops.length !== 1 ? "ies" : "y"}</span>
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SOPs…"
            className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100"
          />
        </div>
        {canEdit && (
          <Link href={newHref}>
            <Button size="sm"><Plus className="w-4 h-4" /> New SOP</Button>
          </Link>
        )}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="surface-card p-16 text-center">
          <ListChecks className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-300 font-semibold text-lg mb-1">{sops.length === 0 ? "No SOPs yet" : "No results"}</p>
          <p className="text-zinc-500 text-sm mb-5">
            {sops.length === 0
              ? canEdit
                ? "Create your first Standard Operating Procedure."
                : "No procedures have been created yet — contact your admin."
              : `No procedures match "${search}".`}
          </p>
          {sops.length === 0 && canEdit && (
            <Link href={newHref}>
              <Button variant="outline" size="sm"><Plus className="w-4 h-4" /> Create first SOP</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <p className="label-section text-amber-400">{category}</p>
                <span className="text-xs text-zinc-600 ml-1">({items.length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map(sop => {
                  const stepCount = sop.body.split("\n").filter(l => /^(step\s*\d+|\d+[.):])/i.test(l.trim())).length;
                  return (
                    <Link
                      key={sop.id}
                      href={`/sops/${sop.id}`}
                      className="surface-card group flex items-center gap-4 px-5 py-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                        <ListChecks className="w-4.5 h-4.5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-base text-zinc-100 group-hover:text-white transition-colors">{sop.title}</p>
                          {sop.client_id === null && <span className="text-[10px] font-medium uppercase tracking-wide text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-1.5 py-0.5 shrink-0">Library</span>}
                        </div>
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
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
