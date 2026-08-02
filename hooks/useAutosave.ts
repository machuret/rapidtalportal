"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { ROUTES } from "@/lib/api/routes";
import type { NotebookPage } from "@/lib/notebook/types";

export type NotebookSaveState = "idle" | "saving" | "saved" | "error";

/** Full document context the saver writes from (content + conflict token). */
export interface AutosaveDocument {
  id: string;
  title: string;
  content: JSONContent | null;
  updatedAt: string;
}

interface UseAutosaveOptions {
  /**
   * Initially selected page (first render only), mirroring the ref
   * initializers this hook replaces. `content` is intentionally absent: the
   * content ref starts null until the first edit, exactly as before.
   */
  initialDocument?: Omit<AutosaveDocument, "content"> | null;
  /** Reflect a successful save into the sidebar page list. */
  onSavedPage: (
    id: string,
    saved: Pick<NotebookPage, "title" | "updated_at" | "last_edited_by">,
  ) => void;
}

/**
 * Notebook autosave engine: 1.5s-debounced PATCH of the open page with
 * last-writer-wins conflict detection.
 *
 * Deliberately uses a raw `fetch` instead of `lib/api-client`: the conflict
 * path depends on reading the raw 409 status. api-client throws on any
 * non-2xx (and toasts by default), which would turn "the other party edited
 * this page" into a generic error toast instead of setting `stale` and
 * showing the reload banner.
 *
 * Owns the saveState machine (idle → saving → saved/error) and the stale
 * flag; callers swap the target document via loadDocument/replaceDocument.
 */
export function useAutosave({ initialDocument = null, onSavedPage }: UseAutosaveOptions) {
  const [saveState, setSaveState] = useState<NotebookSaveState>("idle");
  const [stale, setStale] = useState(false);

  // Refs keep the debounced saver free of stale closures.
  const pageIdRef = useRef<string | null>(initialDocument?.id ?? null);
  const contentRef = useRef<JSONContent | null>(null);
  const titleRef = useRef<string>(initialDocument?.title ?? "");
  const updatedAtRef = useRef<string>(initialDocument?.updatedAt ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always points at the latest flush logic so any handler can drain a pending
  // save before changing context (avoids losing edits inside the debounce window).
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const doSave = useCallback(async () => {
    const id = pageIdRef.current;
    if (!id) return;
    setSaveState("saving");
    try {
      const res = await fetch(ROUTES.notebook.pages(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: titleRef.current,
          content: contentRef.current,
          expectedUpdatedAt: updatedAtRef.current,
        }),
      });
      if (res.status === 409) { setStale(true); setSaveState("idle"); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const saved = json as NotebookPage;
      updatedAtRef.current = saved.updated_at;
      onSavedPage(id, {
        title: saved.title,
        updated_at: saved.updated_at,
        last_edited_by: saved.last_edited_by,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [onSavedPage]);

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

  const flush = useCallback(() => flushRef.current(), []);

  /** Title input edits — saved on the next debounce window. */
  const updateTitle = useCallback((title: string) => { titleRef.current = title; }, []);
  /** Editor edits — saved on the next debounce window. */
  const updateContent = useCallback((content: JSONContent) => { contentRef.current = content; }, []);

  /**
   * Point the saver at a different page (selection switch, or reloading the
   * open page from the server): refs ← doc, stale cleared, saveState reset.
   * Callers must `await flush()` first when leaving a page with pending edits.
   */
  const loadDocument = useCallback((doc: AutosaveDocument | null) => {
    pageIdRef.current = doc?.id ?? null;
    contentRef.current = doc?.content ?? null;
    titleRef.current = doc?.title ?? "";
    updatedAtRef.current = doc?.updatedAt ?? "";
    setStale(false);
    setSaveState("idle");
  }, []);

  /**
   * Replace the open document in place (revision restore): refs ← doc and
   * stale cleared, but saveState is left alone — same semantics as before.
   */
  const replaceDocument = useCallback((doc: AutosaveDocument) => {
    pageIdRef.current = doc.id;
    contentRef.current = doc.content;
    titleRef.current = doc.title;
    updatedAtRef.current = doc.updatedAt;
    setStale(false);
  }, []);

  /** Flag that the other party changed the open page (realtime handler). */
  const markStale = useCallback(() => { setStale(true); }, []);

  return {
    saveState,
    stale,
    scheduleSave,
    flush,
    updateTitle,
    updateContent,
    loadDocument,
    replaceDocument,
    markStale,
  };
}
