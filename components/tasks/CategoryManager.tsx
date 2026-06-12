"use client";

/**
 * Admin-only dialog to manage a client's task categories: add, rename, recolour,
 * delete. Colours come from the shared palette (lib/tasks/category-colors). After
 * each change it refreshes the server page so card chips reflect the edit.
 */
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { CATEGORY_COLOR_KEYS, categoryColor } from "@/lib/tasks/category-colors";

export interface TaskCategory { id: string; name: string; color: string }

function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {CATEGORY_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(key)}
          title={key}
          aria-label={`Colour: ${key}`}
          aria-pressed={value === key}
          className={cn(
            "w-5 h-5 rounded-full transition-transform",
            categoryColor(key).swatch,
            value === key ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110" : "opacity-70 hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
}

function Row({ cat, onChanged }: { cat: TaskCategory; onChanged: () => void }) {
  const [name, setName] = useState(cat.name);
  const [busy, setBusy] = useState(false);

  async function patch(fields: { name?: string; color?: string }) {
    setBusy(true);
    try {
      await api.patch(ROUTES.taskCategories(), { id: cat.id, ...fields });
      onChanged();
    } catch { /* api-client toasts */ } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Delete "${cat.name}"? Cards keep their data but become uncategorised.`)) return;
    setBusy(true);
    try {
      await api.delete(ROUTES.taskCategories(), { id: cat.id });
      toast.success("Category deleted.");
      onChanged();
    } catch { /* api-client toasts */ } finally { setBusy(false); }
  }

  const dirty = name.trim() !== cat.name && name.trim().length > 0;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (dirty) void patch({ name: name.trim() }); }}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) void patch({ name: name.trim() }); }}
        disabled={busy}
        className="bg-zinc-800 border-zinc-700 h-8 flex-1"
      />
      <ColorPicker value={cat.color} onChange={(c) => void patch({ color: c })} disabled={busy} />
      <button onClick={remove} disabled={busy} title="Delete category" aria-label={`Delete category ${cat.name}`}
        className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function CategoryManager({
  clientId, categories, open, onClose, onChanged,
}: {
  clientId: string;
  categories: TaskCategory[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(CATEGORY_COLOR_KEYS[1]);
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await api.post(ROUTES.taskCategories(), { clientId, name, color: newColor });
      toast.success("Category added.");
      setNewName("");
      onChanged();
    } catch { /* api-client toasts */ } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-0.5 max-h-[40vh] overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">No categories yet. Add your first below.</p>
            ) : (
              categories.map((c) => <Row key={c.id} cat={c} onChanged={onChanged} />)
            )}
          </div>

          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
            <p className="label-section">Add a category</p>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
                placeholder="e.g. Content, Outreach, Admin"
                disabled={busy}
                className="bg-zinc-800 border-zinc-700 h-8 flex-1"
              />
              <Button size="sm" onClick={add} disabled={busy || !newName.trim()} className="gap-1.5 shrink-0">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
              </Button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} disabled={busy} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
