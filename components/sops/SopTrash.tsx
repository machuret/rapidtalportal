"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, Undo2, ChevronDown, ChevronRight } from "lucide-react";

export interface TrashedSop {
  id: string;
  title: string;
  category: string | null;
  deleted_at: string | null;
}

/**
 * Recently-deleted SOPs with one-click restore — the UI mirror of the soft
 * delete (migration 079). Collapsed by default so it stays out of the way; the
 * count is always visible so an accidental delete is easy to find and undo.
 */
export function SopTrash({ initial }: { initial: TrashedSop[] }) {
  const router = useRouter();
  const [items, setItems] = useState<TrashedSop[]>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function restore(sop: TrashedSop) {
    if (busy) return;
    setBusy(sop.id);
    try {
      await api.post(ROUTES.sopRestore(), { id: sop.id }, { showErrorToast: false });
      setItems((prev) => prev.filter((s) => s.id !== sop.id));
      toast.success(`Restored “${sop.title}”.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore the SOP.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="surface-card mb-6 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800/50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Trash2 className="w-4 h-4 text-zinc-500" />
        <span className="font-medium">Recently deleted</span>
        <span className="ml-1 text-xs text-zinc-500">({items.length})</span>
      </button>

      {open && (
        <div className="divide-y divide-zinc-800/70 border-t border-zinc-800">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{s.title}</p>
                <p className="text-xs text-zinc-500">
                  {s.category || "General"}
                  {s.deleted_at ? ` · deleted ${formatDate(s.deleted_at)}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => restore(s)}
                disabled={!!busy}
                className="gap-1.5 shrink-0"
              >
                {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
