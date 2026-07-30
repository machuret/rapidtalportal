"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import { Editor } from "./Editor";
import { RevisionDrawer } from "./RevisionDrawer";
import type { NotebookPage } from "@/lib/notebook/types";
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

type SaveState = "idle" | "saving" | "saved" | "error";

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

export function NotebookApp({ placements, activePlacementId, pages: initialPages, participants, currentUserId }: Props) {
  const router = useRouter();
  const [pages, setPages] = useState<NotebookPage[]>(initialPages);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPages.find((p) => !p.is_archived)?.id ?? initialPages[0]?.id ?? null,
  );
  const [editorKey, setEditorKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [stale, setStale] = useState(false);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragId = useRef<string | null>(null);

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  // Refs keep the debounced saver free of stale closures.
  const contentRef = useRef<JSONContent | null>(null);
  const titleRef = useRef<string>(selected?.title ?? "");
  const updatedAtRef = useRef<string>(selected?.updated_at ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always points at the latest flush logic so any handler can drain a pending
  // save before changing context (avoids losing edits inside the debounce window).
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const nameFor = useCallback((uid: string | null) => {
    if (uid === participants.vaUserId) return participants.vaName;
    if (uid === participants.clientUserId) return participants.clientName;
    return "RapidTal template";
  }, [participants]);

  // ---- selection ----
  const selectPage = useCallback(async (id: string) => {
    await flushRef.current(); // persist any pending edits to the page we're leaving
    const p = pages.find((x) => x.id === id);
    setSelectedId(id);
    setStale(false);
    setSaveState("idle");
    contentRef.current = (p?.content as JSONContent) ?? null;
    titleRef.current = p?.title ?? "";
    updatedAtRef.current = p?.updated_at ?? "";
    setEditorKey((k) => k + 1);
  }, [pages]);

  // ---- autosave (debounce 1.5s) ----
  const doSave = useCallback(async () => {
    const id = selectedId;
    if (!id) return;
    setSaveState("saving");
    try {
      const res = await fetch(ROUTES.notebook.pages(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: titleRef.current, content: contentRef.current, expectedUpdatedAt: updatedAtRef.current }),
      });
      if (res.status === 409) { setStale(true); setSaveState("idle"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const saved = json as NotebookPage;
      updatedAtRef.current = saved.updated_at;
      setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title: saved.title, updated_at: saved.updated_at, last_edited_by: saved.last_edited_by } : p)));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [selectedId]);

  const scheduleSave = useCallback(() => {
    if (stale) return;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void doSave(); }, 1500);
  }, [doSave, stale]);

  // Drain a queued save immediately. Kept in a ref so stable callbacks (and the
  // unmount cleanup) can flush without depending on the latest doSave identity.
  flushRef.current = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; await doSave(); }
  };

  useEffect(() => () => { void flushRef.current(); }, []);

  // ---- realtime: reflect the other party's changes ----
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notebook:${activePlacementId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notebook_pages", filter: `placement_id=eq.${activePlacementId}` },
        (payload) => {
          const row = payload.new as NotebookPage;
          if (!row?.id) return;
          if (row.last_edited_by === currentUserId) return; // ignore our own echo
          setPages((prev) => {
            const exists = prev.some((p) => p.id === row.id);
            return exists ? prev.map((p) => (p.id === row.id ? row : p)) : [...prev, row];
          });
          if (row.id === selectedId) setStale(true); // they changed the open page
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activePlacementId, selectedId, currentUserId]);

  // ---- mutations ----
  async function newPage(parentPageId: string | null) {
    try {
      const page = await api.post<NotebookPage>(ROUTES.notebook.pages(), { placementId: activePlacementId, parentPageId, title: "New page" });
      setPages((p) => [...p, page]);
      if (parentPageId) setExpanded((e) => ({ ...e, [parentPageId]: true }));
      void selectPage(page.id);
    } catch { /* api-client toasts */ }
  }

  async function setArchived(id: string, value: boolean) {
    try {
      const updated = await api.patch<NotebookPage>(ROUTES.notebook.pages(), { id, isArchived: value });
      setPages((p) => p.map((x) => (x.id === id ? { ...x, is_archived: updated.is_archived, updated_at: updated.updated_at } : x)));
      if (value && id === selectedId) {
        const next = pages.find((p) => !p.is_archived && p.id !== id);
        if (next) void selectPage(next.id); else setSelectedId(null);
      }
      toast.success(value ? "Page archived." : "Page restored.");
    } catch { /* toasts */ }
  }

  async function reloadSelected() {
    if (!selectedId) return;
    try {
      const res = await fetch(`${ROUTES.notebook.pages()}?id=${selectedId}`);
      const fresh = (await res.json()) as NotebookPage;
      if (!res.ok) throw new Error();
      setPages((p) => p.map((x) => (x.id === fresh.id ? fresh : x)));
      contentRef.current = fresh.content as JSONContent;
      titleRef.current = fresh.title;
      updatedAtRef.current = fresh.updated_at;
      setStale(false);
      setSaveState("idle");
      setEditorKey((k) => k + 1);
    } catch { toast.error("Couldn't reload the page."); }
  }

  function onRestored(page: NotebookPage) {
    setPages((p) => p.map((x) => (x.id === page.id ? page : x)));
    contentRef.current = page.content as JSONContent;
    titleRef.current = page.title;
    updatedAtRef.current = page.updated_at;
    setStale(false);
    setEditorKey((k) => k + 1);
    setDrawerOpen(false);
    toast.success("Revision restored.");
  }

  // ---- reorder within a level ----
  async function dropOn(targetId: string) {
    const src = dragId.current; dragId.current = null;
    if (!src || src === targetId) return;
    const srcPage = pages.find((p) => p.id === src);
    const tgtPage = pages.find((p) => p.id === targetId);
    if (!srcPage || !tgtPage || srcPage.parent_page_id !== tgtPage.parent_page_id) return; // same level only
    const level = pages
      .filter((p) => p.parent_page_id === srcPage.parent_page_id && !p.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order);
    const without = level.filter((p) => p.id !== src);
    const idx = without.findIndex((p) => p.id === targetId);
    without.splice(idx, 0, srcPage);
    const items = without.map((p, i) => ({ id: p.id, sortOrder: i, parentPageId: p.parent_page_id }));
    setPages((prev) => prev.map((p) => { const it = items.find((i) => i.id === p.id); return it ? { ...p, sort_order: it.sortOrder } : p; }));
    try { await api.post(ROUTES.notebook.pagesReorder(), { items }); } catch { /* toasts */ }
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

  function PageRow({ page, depth }: { page: NotebookPage; depth: number }) {
    const kids = pages.filter((p) => p.parent_page_id === page.id && !p.is_archived);
    const isOpen = expanded[page.id] ?? true;
    return (
      <div>
        <div
          draggable
          onDragStart={() => { dragId.current = page.id; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void dropOn(page.id); }}
          onClick={() => void selectPage(page.id)}
          className={cn(
            "group flex items-center gap-1 pr-1.5 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
            depth === 0 ? "pl-1.5" : "pl-5",
            page.id === selectedId ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
          )}
        >
          {depth === 0 && kids.length > 0 ? (
            <button aria-label={isOpen ? "Collapse sub-pages" : "Expand sub-pages"} aria-expanded={isOpen}
              onClick={(e) => { e.stopPropagation(); setExpanded((x) => ({ ...x, [page.id]: !isOpen })); }}
              className="text-zinc-500 hover:text-white shrink-0">
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-90")} />
            </button>
          ) : <span className="w-3.5 shrink-0" />}
          <GripVertical className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 shrink-0" />
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate flex-1">{page.title || "New page"}</span>
          {depth === 0 && (
            <button title="Add sub-page" aria-label="Add sub-page" onClick={(e) => { e.stopPropagation(); void newPage(page.id); }}
              className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {depth === 0 && isOpen && kids.sort((a, b) => a.sort_order - b.sort_order).map((c) => (
          <PageRow key={c.id} page={c} depth={1} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-0 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 h-[calc(100vh-13rem)] min-h-[500px]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900/40">
        {placements.length > 1 && (
          <div className="p-2 border-b border-zinc-800">
            <select
              value={activePlacementId}
              aria-label="Switch placement"
              onChange={async (e) => { await flushRef.current(); router.push(`/notebook?placement=${e.target.value}`); }}
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
          {tree.map(({ page }) => <PageRow key={page.id} page={page} depth={0} />)}

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
                onChange={(e) => {
                  const v = e.target.value;
                  titleRef.current = v;
                  setPages((p) => p.map((x) => (x.id === selected.id ? { ...x, title: v } : x)));
                  scheduleSave();
                }}
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
                onChange={(json) => { contentRef.current = json; scheduleSave(); }}
              />
            </div>

            <div className="border-t border-zinc-800 px-5 py-2 text-xs text-zinc-500">
              Last edited by {nameFor(selected.last_edited_by)} · {relTime(selected.updated_at)}
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
