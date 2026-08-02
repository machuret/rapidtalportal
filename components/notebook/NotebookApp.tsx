"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JSONContent } from "@tiptap/core";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { Editor } from "./Editor";
import { RevisionDrawer } from "./RevisionDrawer";
import type { NotebookPage } from "@/lib/notebook/types";
import { useNotebookPages } from "@/hooks/useNotebookPages";
import {
  Plus, FileText, ChevronRight, Search, Archive, ArchiveRestore, History,
  Check, Loader2, AlertTriangle, GripVertical,
} from "lucide-react";

export interface NotebookParticipants {
  vaUserId: string; vaName: string; clientUserId: string; clientName: string;
}
export interface PlacementOption { id: string; counterpartName: string; clientName: string | null; status: string }

interface Props {
  placements: PlacementOption[];
  activePlacementId: string;
  pages: NotebookPage[];
  participants: NotebookParticipants;
  currentUserId: string;
}

export function NotebookApp({ placements, activePlacementId, pages: initialPages, participants, currentUserId }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pages, selection, realtime and mutations live in the hook; this component
  // keeps the tree rendering, filter, expanded state, placement switching and
  // editor wiring.
  const {
    pages, selected, selectedId, editorKey, dragId,
    selectPage, newPage, setArchived, reloadSelected, applyRestoredPage, setPageTitle, dropOn,
    autosave,
  } = useNotebookPages({
    initialPages,
    activePlacementId,
    currentUserId,
    onNewSubPage: (parentId) => setExpanded((e) => ({ ...e, [parentId]: true })),
  });
  const { saveState, stale, scheduleSave, flush, updateContent } = autosave;

  const nameFor = useCallback((uid: string | null) => {
    if (uid === participants.vaUserId) return participants.vaName;
    if (uid === participants.clientUserId) return participants.clientName;
    return "RapidTal template";
  }, [participants]);

  function onRestored(page: NotebookPage) {
    applyRestoredPage(page);
    setDrawerOpen(false);
  }

  // ---- tree ----
  const tree = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const match = (p: NotebookPage) => !q || p.title.toLowerCase().includes(q);
    const top = pages.filter((p) => !p.parent_page_id && !p.is_archived).sort((a, b) => a.sort_order - b.sort_order);
    const childrenOf = (id: string) => pages.filter((p) => p.parent_page_id === id && !p.is_archived).sort((a, b) => a.sort_order - b.sort_order);
    return top
      .map((p) => ({ page: p, children: childrenOf(p.id) }))
      .filter(({ page, children }) => match(page) || children.some(match));
  }, [pages, filter]);

  const archived = pages.filter((p) => p.is_archived).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex gap-0 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 h-[calc(100vh-13rem)] min-h-[500px]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900/40">
        {placements.length > 1 && (
          <div className="p-2 border-b border-zinc-800">
            <select
              value={activePlacementId}
              aria-label="Switch placement"
              onChange={async (e) => { await flush(); router.push(`/notebook?placement=${e.target.value}`); }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 h-8 text-sm text-zinc-200"
            >
              {placements.map((pl) => <option key={pl.id} value={pl.id}>{pl.counterpartName}{pl.clientName ? ` · ${pl.clientName}` : ""}</option>)}
            </select>
          </div>
        )}
        <div className="p-2 flex items-center gap-2 border-b border-zinc-800">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter pages…" aria-label="Filter pages"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-7 pr-2 h-8 text-sm text-zinc-200 placeholder:text-zinc-500" />
          </div>
          <button title="New page" aria-label="New page" onClick={() => void newPage(null)}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 shrink-0">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {tree.length === 0 && <p className="text-xs text-zinc-600 text-center py-6">No pages yet.</p>}
          {tree.map(({ page }) => (
            <PageRow
              key={page.id}
              page={page}
              depth={0}
              pages={pages}
              expanded={expanded}
              selectedId={selectedId}
              dragId={dragId}
              onDrop={(targetId) => void dropOn(targetId)}
              onSelect={(id) => void selectPage(id)}
              onToggle={(id, next) => setExpanded((x) => ({ ...x, [id]: next }))}
              onAddSub={(parentId) => void newPage(parentId)}
            />
          ))}

          {archived.length > 0 && (
            <div className="mt-3 border-t border-zinc-800 pt-2">
              <button onClick={() => setShowArchived((s) => !s)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 w-full">
                <ChevronRight className={cn("w-3 h-3 transition-transform", showArchived && "rotate-90")} />
                <Archive className="w-3 h-3" /> Archived ({archived.length})
              </button>
              {showArchived && archived.map((p) => (
                <div key={p.id} className="group flex items-center gap-1.5 pl-6 pr-1.5 py-1.5 text-sm text-zinc-500">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1 line-through">{p.title || "New page"}</span>
                  <button title="Restore" aria-label={`Restore ${p.title || "New page"}`} onClick={() => void setArchived(p.id, false)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-green-400 shrink-0">
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Page view */}
      <section className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
              <input
                value={selected.title}
                onChange={(e) => setPageTitle(selected.id, e.target.value)}
                placeholder="New page"
                aria-label="Page title"
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder:text-zinc-600"
              />
              <div className="flex items-center gap-1 text-xs text-zinc-500 shrink-0 w-16 justify-end">
                {saveState === "saving" && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving</>}
                {saveState === "saved" && <><Check className="w-3.5 h-3.5 text-green-400" /> Saved</>}
                {saveState === "error" && <span className="text-red-400">Error</span>}
              </div>
              <button title="Revision history" aria-label="Revision history" onClick={() => setDrawerOpen(true)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0">
                <History className="w-4 h-4" />
              </button>
              <button title="Archive page" aria-label="Archive page" onClick={() => void setArchived(selected.id, true)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 shrink-0">
                <Archive className="w-4 h-4" />
              </button>
            </div>

            {stale && (
              <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">This page was updated by the other party. Reload to see their changes (your unsaved edits will be discarded).</span>
                <button onClick={() => void reloadSelected()} className="underline font-medium shrink-0">Reload</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <Editor
                key={`${selected.id}-${editorKey}`}
                content={(selected.content as JSONContent) ?? undefined}
                placementId={activePlacementId}
                pageId={selected.id}
                onChange={(json) => { updateContent(json); scheduleSave(); }}
              />
            </div>

            <div className="border-t border-zinc-800 px-5 py-2 text-xs text-zinc-500">
              Last edited by {nameFor(selected.last_edited_by)} · {timeAgo(selected.updated_at)}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Select a page, or create one with the + button.
          </div>
        )}
      </section>

      {selected && (
        <RevisionDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          pageId={selected.id}
          nameFor={nameFor}
          onRestored={onRestored}
        />
      )}
    </div>
  );
}

// Module scope, NOT inside NotebookApp: a component declared in render gets a
// new type identity every render, so React unmounted/remounted the whole
// sidebar subtree on every keystroke. Stable identity → rows can diff.
function PageRow({
  page, depth, pages, expanded, selectedId, dragId, onDrop, onSelect, onToggle, onAddSub,
}: {
  page: NotebookPage;
  depth: number;
  pages: NotebookPage[];
  expanded: Record<string, boolean>;
  selectedId: string | null;
  dragId: React.MutableRefObject<string | null>;
  onDrop: (targetId: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
  onAddSub: (parentId: string) => void;
}) {
  const kids = pages.filter((p) => p.parent_page_id === page.id && !p.is_archived);
  const isOpen = expanded[page.id] ?? true;
  return (
    <div>
      <div
        draggable
        onDragStart={() => { dragId.current = page.id; }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onDrop(page.id); }}
        onClick={() => onSelect(page.id)}
        className={cn(
          "group flex items-center gap-1 pr-1.5 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
          depth === 0 ? "pl-1.5" : "pl-5",
          page.id === selectedId ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
        )}
      >
        {depth === 0 && kids.length > 0 ? (
          <button aria-label={isOpen ? "Collapse sub-pages" : "Expand sub-pages"} aria-expanded={isOpen}
            onClick={(e) => { e.stopPropagation(); onToggle(page.id, !isOpen); }}
            className="text-zinc-500 hover:text-white shrink-0">
            <ChevronRight className={cn("w-3 h-3 transition-transform", isOpen && "rotate-90")} />
          </button>
        ) : <span className="w-3.5 shrink-0" />}
        <GripVertical className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 shrink-0" />
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate flex-1">{page.title || "New page"}</span>
        {depth === 0 && (
          <button title="Add sub-page" aria-label="Add sub-page" onClick={(e) => { e.stopPropagation(); onAddSub(page.id); }}
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {depth === 0 && isOpen && kids.sort((a, b) => a.sort_order - b.sort_order).map((c) => (
        <PageRow
          key={c.id}
          page={c}
          depth={1}
          pages={pages}
          expanded={expanded}
          selectedId={selectedId}
          dragId={dragId}
          onDrop={onDrop}
          onSelect={onSelect}
          onToggle={onToggle}
          onAddSub={onAddSub}
        />
      ))}
    </div>
  );
}
