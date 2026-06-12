"use client";

/**
 * Admin-only dialog to manage recurring tasks. Each recurrence is a blueprint
 * the daily cron turns into a real card. Supports add, pause/resume (active),
 * and delete. After each change it refreshes the server page.
 */
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Play, Pause, Repeat } from "lucide-react";
import { cadenceLabel, FREQUENCIES, type Frequency } from "@/lib/tasks/recurrence";
import type { BoardMember, TaskCategory } from "./TaskBoard";

export interface TaskRecurrence {
  id: string;
  assigned_to: string | null;
  category_id: string | null;
  title: string;
  priority: number;
  frequency: string;
  interval: number;
  next_run_on: string;
  active: boolean;
}

const selectCls = "bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300";
const fmtDate = (ymd: string) => new Date(ymd + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Row({ rec, memberName, onChanged }: { rec: TaskRecurrence; memberName: (id: string | null) => string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const who = memberName(rec.assigned_to);

  async function call(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); onChanged(); } catch { /* api-client toasts */ } finally { setBusy(false); }
  }

  return (
    <div className={cn("flex items-center gap-3 py-2 border-b border-zinc-800 last:border-0", !rec.active && "opacity-50")}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{rec.title}</p>
        <p className="text-xs text-zinc-500">
          {cadenceLabel(rec.frequency as Frequency, rec.interval)}
          {rec.active ? ` · next ${fmtDate(rec.next_run_on)}` : " · paused"}
          {who ? ` · ${who.split(" ")[0]}` : ""}
        </p>
      </div>
      <button onClick={() => call(() => api.patch(ROUTES.taskRecurrences(), { id: rec.id, active: !rec.active }))}
        disabled={busy} title={rec.active ? "Pause" : "Resume"}
        className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : rec.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <button onClick={() => { if (confirm(`Delete recurring task "${rec.title}"? Already-created cards stay.`)) void call(async () => { await api.delete(ROUTES.taskRecurrences(), { id: rec.id }); toast.success("Recurring task deleted."); }); }}
        disabled={busy} title="Delete"
        className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export function RecurrenceManager({
  clientId, recurrences, members, categories, open, onClose, onChanged,
}: {
  clientId: string;
  recurrences: TaskRecurrence[];
  members: BoardMember[];
  categories: TaskCategory[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [interval, setInterval] = useState(1);
  const [assignedTo, setAssignedTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState(2);
  const [busy, setBusy] = useState(false);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  async function add() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await api.post(ROUTES.taskRecurrences(), {
        clientId, title: t, frequency, interval,
        assignedTo: assignedTo || null,
        categoryId: categoryId || null,
        priority,
      });
      toast.success("Recurring task added.");
      setTitle("");
      onChanged();
    } catch { /* api-client toasts */ } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Repeat className="w-4 h-4" /> Recurring tasks</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col max-h-[35vh] overflow-y-auto">
            {recurrences.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">No recurring tasks yet. New cards appear automatically on the cadence you set below.</p>
            ) : (
              recurrences.map((r) => <Row key={r.id} rec={r} memberName={memberName} onChanged={onChanged} />)
            )}
          </div>

          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
            <p className="label-section">Add a recurring task</p>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder="e.g. Weekly performance report" disabled={busy}
              className="bg-zinc-800 border-zinc-700 h-9" />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Repeats</Label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} disabled={busy} className={selectCls}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Every (interval)</Label>
                <Input type="number" min={1} max={52} value={interval}
                  onChange={(e) => setInterval(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                  disabled={busy} className="bg-zinc-800 border-zinc-700 h-9" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Assignee</Label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={busy} className={selectCls}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} disabled={busy} className={selectCls}>
                  <option value={1}>Low</option>
                  <option value={2}>Normal</option>
                  <option value={3}>High</option>
                  <option value={4}>Urgent</option>
                </select>
              </div>
              {categories.length > 0 && (
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label>Category</Label>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy} className={selectCls}>
                    <option value="">None</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <Button size="sm" onClick={add} disabled={busy || !title.trim()} className="gap-1.5 self-start">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add recurring task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
