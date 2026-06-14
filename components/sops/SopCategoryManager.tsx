"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderTree, ChevronDown, ChevronRight, Pencil, Check, X, Tag, Plus, Trash2, CornerDownRight } from "lucide-react";

export interface CategoryNode { name: string; count: number; subs: { name: string; count: number }[] }
type Kind = "category" | "subcategory";

/**
 * Category → Subcategory tree. Each category lists its subcategories beneath it
 * with an inline "add subcategory" scoped to that category, so the relationship
 * is obvious. Create, rename (merge), and delete for both. Table-backed, so an
 * empty category/subcategory persists.
 */
export function SopCategoryManager({ clientId, tree }: { clientId: string | null; tree: CategoryNode[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // `${kind}:${name}`
  const [editVal, setEditVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null); // category name
  const [newSub, setNewSub] = useState("");

  async function run(fn: () => Promise<unknown>, ok: string, done?: () => void) {
    if (busy) return;
    setBusy(true);
    try { await fn(); toast.success(ok); done?.(); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const createCategory = () => newCat.trim() && run(
    () => api.post(ROUTES.sopCategories(), { clientId, kind: "category", name: newCat.trim() }),
    "Category created.", () => setNewCat(""));
  const createSub = (parent: string) => newSub.trim() && run(
    () => api.post(ROUTES.sopCategories(), { clientId, kind: "subcategory", name: newSub.trim(), parent }),
    "Subcategory added.", () => { setNewSub(""); setAddingSubTo(null); });
  const rename = (kind: Kind, from: string) => {
    const to = editVal.trim();
    if (!to || to === from) { setEditing(null); return; }
    run(() => api.patch(ROUTES.sopCategories(), { clientId, kind, from, to }), "Renamed.", () => setEditing(null));
  };
  const remove = (kind: Kind, name: string) => {
    if (!confirm(`Delete "${name}"? SOPs keep their text; it stops being a managed option.`)) return;
    run(() => api.delete(ROUTES.sopCategories(), { clientId, kind, name }), "Deleted.");
  };

  function nameRow(kind: Kind, name: string, count: number, indent: boolean) {
    const key = `${kind}:${name}`;
    if (editing === key) {
      return (
        <div className={`flex items-center gap-2 py-1.5 ${indent ? "pl-7 pr-2" : "px-2"}`}>
          {indent && <CornerDownRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
          <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") rename(kind, name); if (e.key === "Escape") setEditing(null); }}
            className="bg-zinc-800 border-zinc-700 h-7 text-sm flex-1" />
          <button onClick={() => rename(kind, name)} disabled={busy} className="text-green-400 hover:text-green-300 shrink-0"><Check className="w-4 h-4" /></button>
          <button onClick={() => setEditing(null)} disabled={busy} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X className="w-4 h-4" /></button>
        </div>
      );
    }
    return (
      <div className={`group flex items-center gap-2 py-1.5 ${indent ? "pl-7 pr-2" : "px-2"}`}>
        {indent ? <CornerDownRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" /> : <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
        <span className={`text-sm flex-1 truncate ${indent ? "text-zinc-300" : "text-zinc-100 font-medium"}`}>{name}</span>
        <span className="text-xs text-zinc-600 shrink-0">{count}</span>
        <button onClick={() => { setEditing(key); setEditVal(name); }} title="Rename / merge" className="text-zinc-500 hover:text-amber-400 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={() => remove(kind, name)} title="Delete" className="text-zinc-500 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    );
  }

  return (
    <div className="surface-card mb-6">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <FolderTree className="w-4 h-4 text-amber-400" />
        <span className="label-section">Manage categories</span>
        <span className="text-xs text-zinc-600">{tree.length} categories · {tree.reduce((n, c) => n + c.subs.length, 0)} subcategories</span>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-zinc-500 mb-2">Each category lists its subcategories beneath it. Rename onto an existing name to merge.</p>

          {/* Add a new category */}
          <div className="flex items-center gap-1.5 mb-3">
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category…" disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter") void createCategory(); }}
              className="bg-zinc-800 border-zinc-700 h-8 text-sm max-w-xs" />
            <Button size="sm" className="h-8 gap-1" disabled={busy || !newCat.trim()} onClick={() => void createCategory()}><Plus className="w-3.5 h-3.5" /> Add category</Button>
          </div>

          <div className="flex flex-col gap-2">
            {tree.length === 0 && <p className="text-xs text-zinc-600">No categories yet — add one above.</p>}
            {tree.map((cat) => (
              <div key={cat.name} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
                {nameRow("category", cat.name, cat.count, false)}
                <div className="border-t border-zinc-800/60">
                  {cat.subs.map((sub) => <div key={sub.name}>{nameRow("subcategory", sub.name, sub.count, true)}</div>)}
                  {addingSubTo === cat.name ? (
                    <div className="flex items-center gap-1.5 py-1.5 pl-7 pr-2">
                      <CornerDownRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} autoFocus disabled={busy}
                        placeholder={`New subcategory in ${cat.name}…`}
                        onKeyDown={(e) => { if (e.key === "Enter") void createSub(cat.name); if (e.key === "Escape") { setAddingSubTo(null); setNewSub(""); } }}
                        className="bg-zinc-800 border-zinc-700 h-7 text-sm flex-1" />
                      <button onClick={() => void createSub(cat.name)} disabled={busy || !newSub.trim()} className="text-green-400 hover:text-green-300 shrink-0"><Check className="w-4 h-4" /></button>
                      <button onClick={() => { setAddingSubTo(null); setNewSub(""); }} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingSubTo(cat.name); setNewSub(""); }} className="flex items-center gap-1.5 py-1.5 pl-7 text-xs text-zinc-500 hover:text-amber-400">
                      <Plus className="w-3.5 h-3.5" /> Add subcategory
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
