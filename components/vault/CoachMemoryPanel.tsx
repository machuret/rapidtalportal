"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { coachMemoryKeys, useCoachMemories, type CoachMemory } from "@/hooks/useCoachMemories";

export function CoachMemoryPanel({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const memoriesQuery = useCoachMemories(clientId);
  const memories = memoriesQuery.data ?? [];
  const loading = memoriesQuery.isFetching && !memoriesQuery.data;
  const failed = memoriesQuery.isError;
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidateMemories = () =>
    queryClient.invalidateQueries({ queryKey: coachMemoryKeys.byClient(clientId) });

  // The Coach action path announces approved "Remember" previews through this
  // window event — the current cross-component contract, so the panel keeps
  // listening and now invalidates instead of hand-reloading.
  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: coachMemoryKeys.byClient(clientId) });
    window.addEventListener("coach-memory-changed", refresh);
    return () => window.removeEventListener("coach-memory-changed", refresh);
  }, [queryClient, clientId]);

  async function toggle(memory: CoachMemory) {
    setBusyId(memory.id);
    try {
      await api.patch(ROUTES.coach.memories(), { clientId, id: memory.id, status: memory.status === "active" ? "muted" : "active" });
      await invalidateMemories();
    } catch (error) { toast.error(errorMessage(error, "The private memory could not be updated.")); }
    finally { setBusyId(null); }
  }
  async function remove(memory: CoachMemory) {
    if (!window.confirm("Forget this private Coach memory?")) return;
    setBusyId(memory.id);
    try {
      await api.delete(ROUTES.coach.memories(), { clientId, id: memory.id });
      await invalidateMemories(); toast.success("The Coach forgot that private memory.");
    } catch (error) { toast.error(errorMessage(error, "The private memory could not be deleted.")); }
    finally { setBusyId(null); }
  }

  const active = memories.filter((memory) => memory.status === "active").length;
  return (
    <div className="surface-card mb-4 overflow-hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-3"><span className="rounded-lg bg-blue-500/10 p-2 text-blue-300"><Bookmark className="h-4 w-4" /></span><span><span className="block text-sm font-semibold text-zinc-100">What my Coach remembers</span><span className="block text-xs text-zinc-500">{loading ? "Loading private memory…" : failed ? "Private memory temporarily unavailable" : `${active} active memor${active === 1 ? "y" : "ies"}`}</span></span></span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-zinc-800 p-4">
        <p className="mb-3 text-xs leading-5 text-zinc-500">Only you can see these memories. They remain until you delete them. Muted memories stay visible here but are not supplied to the Coach.</p>
        {failed && <button type="button" onClick={() => void memoriesQuery.refetch()} className="mb-3 text-xs text-amber-300">Retry private memory</button>}
        <div className="space-y-2">
          {memories.map((memory) => <div key={memory.id} className={`rounded-lg border border-zinc-800 p-3 ${memory.status === "muted" ? "opacity-55" : "bg-zinc-950/40"}`}>
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-2xs font-semibold uppercase tracking-wide text-blue-300">{memory.kind}</p><p className="mt-1 text-sm text-zinc-300">{memory.content}</p></div><div className="flex gap-1">{busyId === memory.id ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : <><button type="button" onClick={() => toggle(memory)} aria-label={memory.status === "active" ? "Mute private memory" : "Reactivate private memory"} className="p-1 text-zinc-500 hover:text-white">{memory.status === "active" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button type="button" onClick={() => remove(memory)} aria-label="Delete private memory" className="p-1 text-zinc-600 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></>}</div></div>
          </div>)}
          {!loading && !memories.length && <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">Nothing remembered yet. Use “Remember” in Coach and approve the preview.</p>}
        </div>
      </div>}
    </div>
  );
}
