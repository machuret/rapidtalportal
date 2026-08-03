"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { NotebookPage } from "@/lib/notebook/types";
import { useSupabase } from "@/hooks/useSupabase";
import { useAutosave } from "@/hooks/useAutosave";

interface UseNotebookPagesOptions {
  initialPages: NotebookPage[];
  activePlacementId: string;
  currentUserId: string;
  initialPageId?: string | null;
  /**
   * Expanded-state lives in the component (tree concern); called after a
   * sub-page is created so its parent opens.
   */
  onNewSubPage?: (parentPageId: string) => void;
}

function toAutosaveDoc(page: NotebookPage) {
  return {
    id: page.id,
    title: page.title,
    content: (page.content as JSONContent) ?? null,
    updatedAt: page.updated_at,
  };
}

/**
 * Notebook page collection: state seeded from the server render, the realtime
 * subscription reflecting the other party's changes, and the page mutations
 * (create, archive/restore, select, reorder) with their optimistic updates.
 *
 * Composes useAutosave because the two are mutually dependent: a successful
 * save echoes into the page list, while selection/reload/restore must retarget
 * the saver's document. The full autosave surface is re-exported as `autosave`.
 */
export function useNotebookPages({
  initialPages,
  activePlacementId,
  currentUserId,
  initialPageId = null,
  onNewSubPage,
}: UseNotebookPagesOptions) {
  const [pages, setPages] = useState<NotebookPage[]>(initialPages);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPages.find((p) => p.id === initialPageId && !p.is_archived)?.id
      ?? initialPages.find((p) => !p.is_archived)?.id
      ?? initialPages[0]?.id
      ?? null,
  );
  // Bumped on every context switch to force-remount the editor.
  const [editorKey, setEditorKey] = useState(0);
  const dragId = useRef<string | null>(null);

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  // The saver's refs initialise from the initially selected page (first render
  // only), mirroring the ref initializers the autosave hook replaced.
  const [initialDocument] = useState(() => {
    const first = initialPages.find((p) => p.id === initialPageId && !p.is_archived)
      ?? initialPages.find((p) => !p.is_archived)
      ?? initialPages[0];
    return first ? { id: first.id, title: first.title, updatedAt: first.updated_at } : null;
  });

  const handleSavedPage = useCallback(
    (id: string, saved: Pick<NotebookPage, "title" | "updated_at" | "last_edited_by">) => {
      setPages((prev) =>
        prev.map((p) => (p.id === id
          ? { ...p, title: saved.title, updated_at: saved.updated_at, last_edited_by: saved.last_edited_by }
          : p)),
      );
    },
    [],
  );

  const autosave = useAutosave({ initialDocument, onSavedPage: handleSavedPage });
  const {
    flush,
    loadDocument,
    replaceDocument,
    markStale,
    updateTitle,
    scheduleSave,
  } = autosave;

  // ---- realtime: reflect the other party's changes ----
  // One memoized browser client (useSupabase) — a fresh createClient() per
  // effect run would reopen the channel's websocket on every re-subscribe.
  const supabase = useSupabase();
  useEffect(() => {
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
          if (row.id === selectedId) markStale(); // they changed the open page
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, activePlacementId, selectedId, currentUserId, markStale]);

  // ---- selection ----
  const selectPage = useCallback(async (id: string) => {
    await flush(); // persist any pending edits to the page we're leaving
    const p = pages.find((x) => x.id === id);
    setSelectedId(id);
    loadDocument(p ? toAutosaveDoc(p) : null);
    setEditorKey((k) => k + 1);
  }, [pages, flush, loadDocument]);

  // ---- mutations ----
  async function newPage(parentPageId: string | null) {
    try {
      const page = await api.post<NotebookPage>(ROUTES.notebook.pages(), { placementId: activePlacementId, parentPageId, title: "New page" });
      setPages((p) => [...p, page]);
      if (parentPageId) onNewSubPage?.(parentPageId);
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
      loadDocument(toAutosaveDoc(fresh));
      setEditorKey((k) => k + 1);
    } catch { toast.error("Couldn't reload the page."); }
  }

  /** Revision restore: replace the page in the list and the open document. */
  function applyRestoredPage(page: NotebookPage) {
    setPages((p) => p.map((x) => (x.id === page.id ? page : x)));
    replaceDocument(toAutosaveDoc(page));
    setEditorKey((k) => k + 1);
    toast.success("Revision restored.");
  }

  /** Title input: echo into the sidebar list immediately, autosave debounced. */
  function setPageTitle(id: string, title: string) {
    updateTitle(title);
    setPages((p) => p.map((x) => (x.id === id ? { ...x, title } : x)));
    scheduleSave();
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

  return {
    pages,
    selected,
    selectedId,
    editorKey,
    dragId,
    selectPage,
    newPage,
    setArchived,
    reloadSelected,
    applyRestoredPage,
    setPageTitle,
    dropOn,
    autosave,
  };
}
