"use client";

import { useEffect, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Editor } from "./Editor";
import type { NotebookPage, NotebookRevision } from "@/lib/notebook/types";
import { X, RotateCcw, Loader2 } from "lucide-react";
import { LocalTime } from "@/components/ui/LocalTime";

interface Props {
  open: boolean;
  onClose: () => void;
  pageId: string;
  nameFor: (uid: string | null) => string | null;
  onRestored: (page: NotebookPage) => void;
}

export function RevisionDrawer({ open, onClose, pageId, nameFor, onRestored }: Props) {
  const [revisions, setRevisions] = useState<NotebookRevision[]>([]);
  const [selected, setSelected] = useState<NotebookRevision | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    fetch(`${ROUTES.notebook.revisions()}?pageId=${pageId}`)
      .then((r) => r.json())
      .then((rows: NotebookRevision[]) => { setRevisions(Array.isArray(rows) ? rows : []); setSelected(rows?.[0] ?? null); })
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false));
  }, [open, pageId]);

  async function restore() {
    if (!selected) return;
    setRestoring(true);
    try {
      const page = await api.post<NotebookPage>(ROUTES.notebook.revisions(), { pageId, revisionId: selected.id });
      onRestored(page);
    } catch { /* api-client toasts */ } finally { setRestoring(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Revision history"
        className="relative w-full max-w-3xl bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="font-semibold text-white">Revision history</h2>
          <button onClick={onClose} aria-label="Close revision history" className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* List */}
          <div className="w-56 shrink-0 border-r border-zinc-800 overflow-y-auto">
            {loading && <div className="p-4 text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
            {!loading && revisions.length === 0 && <p className="p-4 text-sm text-zinc-500">No revisions yet.</p>}
            {revisions.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={cn("w-full text-left px-3 py-2 border-b border-zinc-800/60 transition-colors",
                  selected?.id === r.id ? "bg-zinc-800" : "hover:bg-zinc-900")}>
                <p className="text-sm text-zinc-200"><LocalTime value={r.created_at} opts={{ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }} /></p>
                <p className="text-xs text-zinc-500">{(nameFor(r.edited_by) ?? "Someone").split(" ")[0]}</p>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {selected ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                  <p className="text-sm text-zinc-400 truncate">{selected.title || "Untitled"}</p>
                  <Button size="sm" onClick={restore} disabled={restoring} className="gap-1.5 shrink-0">
                    {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Restore
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <Editor key={selected.id} content={selected.content as JSONContent} editable={false} />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">Select a revision to preview.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
