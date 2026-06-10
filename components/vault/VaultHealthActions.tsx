"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Loader2, Trash2 } from "lucide-react";

interface HealthItem { id: string; title: string }

/**
 * One health group with its action verb. Demo/duplicate groups get one-click
 * delete (with confirm); informational groups (stale links) render chips only.
 */
export function HealthGroupActions({ label, hint, items, clientId, deletable }: {
  label: string; hint: string; items: HealthItem[]; clientId: string; deletable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  if (items.length === 0 || gone) return null;

  async function deleteAll() {
    if (busy) return;
    if (!confirm(`Delete ${items.length} item${items.length !== 1 ? "s" : ""} (${label.toLowerCase()})? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.post(ROUTES.vault.delete(), { itemIds: items.map((i) => i.id), clientId });
      setGone(true);
      toast.success(`${items.length} item${items.length !== 1 ? "s" : ""} removed — the brain just got cleaner.`);
      router.refresh();
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-200 font-medium">
          {label} <span className="text-zinc-500 font-normal">· {items.length}</span>
        </p>
        {deletable && (
          <button
            onClick={deleteAll}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete {items.length === 1 ? "it" : "all"}
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-1.5">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 12).map((it) => (
          <span key={it.id} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 truncate max-w-[16rem]">
            {it.title}
          </span>
        ))}
      </div>
    </div>
  );
}
