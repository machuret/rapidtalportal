"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Input } from "@/components/ui/input";
import { FolderTree, ChevronDown, ChevronRight, Pencil, Check, X, Loader2, Tag } from "lucide-react";

export interface CatCount { name: string; count: number }

/**
 * Organise SOP categories & subcategories — rename or merge them. A rename
 * updates every SOP in scope; renaming onto an existing name merges them.
 */
export function SopCategoryManager({ clientId, categories, subcategories }: { clientId: string | null; categories: CatCount[]; subcategories: CatCount[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // `${kind}:${name}`
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function rename(kind: "category" | "subcategory", from: string) {
    const to = value.trim();
    if (busy || to === from) { setEditing(null); return; }
    setBusy(true);
    try {
      const res = await api.post<{ updated: number }>(ROUTES.sopCategories(), { clientId, kind, from, to }, { showErrorToast: false });
      toast.success(`Renamed — ${res.updated} SOP${res.updated !== 1 ? "s" : ""} updated.`);
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rename.");
    } finally {
      setBusy(false);
    }
  }

  function row(kind: "category" | "subcategory", c: CatCount) {
    const key = `${kind}:${c.name}`;
    const isEditing = editing === key;
    return (
      <div key={key} className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 last:border-0">
        <Tag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        {isEditing ? (
          <>
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") void rename(kind, c.name); if (e.key === "Escape") setEditing(null); }}
              className="bg-zinc-800 border-zinc-700 h-7 text-sm flex-1" />
            <button onClick={() => void rename(kind, c.name)} disabled={busy} className="text-green-400 hover:text-green-300 shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button onClick={() => setEditing(null)} disabled={busy} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X className="w-4 h-4" /></button>
          </>
        ) : (
          <>
            <span className="text-sm text-zinc-200 flex-1 truncate">{c.name}</span>
            <span className="text-xs text-zinc-600 shrink-0">{c.count}</span>
            <button onClick={() => { setEditing(key); setValue(c.name); }} title="Rename / merge"
              className="text-zinc-500 hover:text-amber-400 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="surface-card mb-6">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <FolderTree className="w-4 h-4 text-amber-400" />
        <span className="label-section">Manage categories</span>
        <span className="text-xs text-zinc-600">{categories.length} categories · {subcategories.length} subcategories</span>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-zinc-500 mb-2">Rename to tidy up, or rename onto an existing name to merge. Updates every SOP in the library.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Categories</p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
                {categories.length ? categories.map((c) => row("category", c)) : <p className="text-xs text-zinc-600 px-3 py-3">None yet.</p>}
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Subcategories</p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
                {subcategories.length ? subcategories.map((c) => row("subcategory", c)) : <p className="text-xs text-zinc-600 px-3 py-3">None yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
