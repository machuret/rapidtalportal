"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderTree, ChevronDown, ChevronRight, Pencil, Check, X, Loader2, Tag, Plus, Trash2 } from "lucide-react";

export interface CatCount { name: string; count: number }
type Kind = "category" | "subcategory";

/**
 * Create, rename/merge and delete SOP categories & subcategories. Categories are
 * managed entities (table-backed) so you can create one before any SOP uses it.
 * Rename updates every SOP in scope; renaming onto an existing name merges.
 */
export function SopCategoryManager({ clientId, categories, subcategories }: { clientId: string | null; categories: CatCount[]; subcategories: CatCount[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // `${kind}:${name}`
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newSub, setNewSub] = useState("");

  async function run(fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(true);
    try { await fn(); toast.success(ok); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const create = (kind: Kind, name: string, clear: () => void) => {
    if (!name.trim()) return;
    void run(() => api.post(ROUTES.sopCategories(), { clientId, kind, name: name.trim() }), `${kind === "category" ? "Category" : "Subcategory"} created.`).then(clear);
  };
  const rename = (kind: Kind, from: string) => {
    const to = value.trim();
    if (!to || to === from) { setEditing(null); return; }
    void run(() => api.patch(ROUTES.sopCategories(), { clientId, kind, from, to }), "Renamed.").then(() => setEditing(null));
  };
  const remove = (kind: Kind, name: string) => {
    if (!confirm(`Delete "${name}"? SOPs keep their text; it just stops being a managed option.`)) return;
    void run(() => api.delete(ROUTES.sopCategories(), { clientId, kind, name }), "Deleted.");
  };

  function column(kind: Kind, label: string, list: CatCount[], newVal: string, setNewVal: (v: string) => void) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{label}</p>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-1.5 px-2 py-2 border-b border-zinc-800/60">
            <Input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder={`New ${kind}…`} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") create(kind, newVal, () => setNewVal("")); }}
              className="bg-zinc-800 border-zinc-700 h-7 text-sm flex-1" />
            <Button size="sm" variant="outline" className="border-zinc-700 h-7 gap-1" disabled={busy || !newVal.trim()} onClick={() => create(kind, newVal, () => setNewVal(""))}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
          {list.length === 0 && <p className="text-xs text-zinc-600 px-3 py-3">None yet — add one above.</p>}
          {list.map((c) => {
            const key = `${kind}:${c.name}`;
            const isEditing = editing === key;
            return (
              <div key={key} className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 last:border-0">
                <Tag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                {isEditing ? (
                  <>
                    <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus disabled={busy}
                      onKeyDown={(e) => { if (e.key === "Enter") rename(kind, c.name); if (e.key === "Escape") setEditing(null); }}
                      className="bg-zinc-800 border-zinc-700 h-7 text-sm flex-1" />
                    <button onClick={() => rename(kind, c.name)} disabled={busy} className="text-green-400 hover:text-green-300 shrink-0">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditing(null)} disabled={busy} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-zinc-200 flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-zinc-600 shrink-0">{c.count}</span>
                    <button onClick={() => { setEditing(key); setValue(c.name); }} title="Rename / merge" className="text-zinc-500 hover:text-amber-400 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(kind, c.name)} title="Delete" className="text-zinc-500 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
          <p className="text-xs text-zinc-500 mb-2">Create, rename or delete. Rename onto an existing name to merge — it updates every SOP in the library.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {column("category", "Categories", categories, newCat, setNewCat)}
            {column("subcategory", "Subcategories", subcategories, newSub, setNewSub)}
          </div>
        </div>
      )}
    </div>
  );
}
