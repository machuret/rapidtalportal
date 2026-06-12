"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, CalendarDays, Loader2, Trash2, Save, MessageSquare } from "lucide-react";
import { TaskActivity } from "./TaskActivity";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface Task {
  id: string;
  client_id: string;
  assigned_to: string | null;
  created_by: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  order_index: number;
  due_date: string | null;
  priority: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardMember { id: string; name: string }

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: "todo",        label: "To Do",       accent: "border-t-zinc-500" },
  { key: "in_progress", label: "In Progress", accent: "border-t-blue-500" },
  { key: "review",      label: "Review",      accent: "border-t-amber-500" },
  { key: "done",        label: "Done",        accent: "border-t-green-500" },
];

// 1 low · 2 normal · 3 high · 4 urgent. Only high/urgent get a card accent.
const PRIORITY: Record<number, { label: string; border: string; chip: string }> = {
  1: { label: "Low",    border: "",                  chip: "text-zinc-400 bg-zinc-800" },
  2: { label: "Normal", border: "",                  chip: "text-zinc-400 bg-zinc-800" },
  3: { label: "High",   border: "border-l-2 border-l-amber-500", chip: "text-amber-300 bg-amber-500/10" },
  4: { label: "Urgent", border: "border-l-2 border-l-red-500",   chip: "text-red-300 bg-red-500/10" },
};

interface TaskBoardProps {
  initialTasks: Task[];
  clientId: string;
  userId: string;
  isAdmin: boolean; // client_admin or super_admin
  members: BoardMember[]; // assignable people (VAs + admins of the client)
  commentCounts?: Record<string, number>;
}

export function TaskBoard({ initialTasks, clientId, userId, isAdmin, members, commentCounts }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [counts, setCounts] = useState<Record<string, number>>(commentCounts ?? {});
  const [editing, setEditing] = useState<Task | null>(null);
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);
  const [live, setLive] = useState(false);
  const dragId = useRef<string | null>(null);
  const supabaseRef = useRef(createClient());

  // Live updates: anything a teammate creates/moves/edits/deletes shows up here
  // without a refresh. Patches are idempotent so they tolerate the echo of our
  // own optimistic updates (we upsert by id rather than blindly appending).
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`tasks:${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const t = payload.new as Task;
          setTasks((p) => (p.some((x) => x.id === t.id) ? p.map((x) => (x.id === t.id ? t : x)) : [...p, t]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const t = payload.new as Task;
          setTasks((p) => p.map((x) => (x.id === t.id ? t : x)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setTasks((p) => p.filter((x) => x.id !== id));
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => { void supabase.removeChannel(channel); };
  }, [clientId]);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;
  const canMove = (t: Task) => isAdmin || t.assigned_to === userId || t.created_by === userId;

  const byCol = (col: TaskStatus) =>
    tasks.filter((t) => t.status === col).sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at));

  async function moveTo(taskId: string, status: TaskStatus) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === status) return;
    if (!canMove(t)) { toast.error("You can only move your own tasks."); return; }
    const orderIndex = byCol(status).length;
    const prev = tasks;
    setTasks((p) => p.map((x) => (x.id === taskId ? { ...x, status, order_index: orderIndex } : x)));
    try {
      await api.patch(ROUTES.tasks(), { id: taskId, status, orderIndex }, { showErrorToast: false });
    } catch {
      setTasks(prev);
      toast.error("Couldn't move the task.");
    }
  }

  return (
    <>
      <div className="flex items-center justify-end mb-3 -mt-2">
        <span className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors",
          live ? "text-green-400 bg-green-500/10" : "text-zinc-500 bg-zinc-800",
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", live ? "bg-green-400 animate-pulse" : "bg-zinc-500")} />
          {live ? "Live" : "Connecting…"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const items = byCol(col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current) void moveTo(dragId.current, col.key);
                dragId.current = null;
              }}
              className={cn("rounded-xl border border-zinc-800 bg-zinc-900/60 border-t-2", col.accent)}
            >
              <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                <p className="text-sm font-semibold text-zinc-200">
                  {col.label} <span className="text-zinc-500 font-normal">· {items.length}</span>
                </p>
                <button
                  onClick={() => setCreatingIn(col.key)}
                  title="Add task"
                  className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2 p-2.5 pt-1 min-h-[80px]">
                {items.map((t) => {
                  const name = memberName(t.assigned_to);
                  const overdue = t.due_date && t.status !== "done" && new Date(t.due_date) < new Date(new Date().toDateString());
                  return (
                    <div
                      key={t.id}
                      draggable={canMove(t)}
                      onDragStart={() => { dragId.current = t.id; }}
                      onClick={() => setEditing(t)}
                      className={cn(
                        "rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-600",
                        canMove(t) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                        t.status === "done" && "opacity-70",
                        t.status !== "done" && (PRIORITY[t.priority]?.border ?? ""),
                      )}
                    >
                      <p className={cn("text-sm font-medium text-zinc-100 leading-snug", t.status === "done" && "line-through text-zinc-400")}>
                        {t.title}
                      </p>
                      {t.description.trim() && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.description}</p>
                      )}
                      {(name || t.due_date || (counts[t.id] ?? 0) > 0 || t.priority > 2) && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {t.priority > 2 && t.status !== "done" && (
                            <span className={cn("inline-flex items-center text-[11px] font-medium rounded-full px-2 py-0.5", PRIORITY[t.priority].chip)}>
                              {PRIORITY[t.priority].label}
                            </span>
                          )}
                          {(counts[t.id] ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800 rounded-full px-2 py-0.5">
                              <MessageSquare className="w-3 h-3" />
                              {counts[t.id]}
                            </span>
                          )}
                          {name && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800 rounded-full px-2 py-0.5">
                              <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-[9px] font-semibold flex items-center justify-center text-zinc-300">
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                              {name.split(" ")[0]}
                            </span>
                          )}
                          {t.due_date && (
                            <span className={cn("inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5",
                              overdue ? "text-red-400 bg-red-500/10" : "text-zinc-400 bg-zinc-800")}>
                              <CalendarDays className="w-3 h-3" />
                              {new Date(t.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-4">Drop tasks here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {creatingIn && (
        <TaskDialog
          mode="create"
          status={creatingIn}
          clientId={clientId}
          isAdmin={isAdmin}
          members={members}
          onClose={() => setCreatingIn(null)}
          onSaved={(t) => { setTasks((p) => [...p, t]); setCreatingIn(null); }}
        />
      )}
      {editing && (
        <TaskDialog
          mode="edit"
          task={editing}
          status={editing.status}
          clientId={clientId}
          isAdmin={isAdmin}
          canWrite={canMove(editing)}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={(t) => { setTasks((p) => p.map((x) => (x.id === t.id ? t : x))); setEditing(null); }}
          onDeleted={(id) => { setTasks((p) => p.filter((x) => x.id !== id)); setEditing(null); }}
          onCommented={() => setCounts((p) => ({ ...p, [editing.id]: (p[editing.id] ?? 0) + 1 }))}
        />
      )}
    </>
  );
}

function TaskDialog({
  mode, task, status, clientId, isAdmin, canWrite = true, members, onClose, onSaved, onDeleted, onCommented,
}: {
  mode: "create" | "edit";
  task?: Task;
  status: TaskStatus;
  clientId: string;
  isAdmin: boolean;
  canWrite?: boolean;
  members: BoardMember[];
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted?: (id: string) => void;
  onCommented?: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState(task?.priority ?? 2);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (title.trim().length < 1 || busy) return;
    setBusy(true);
    try {
      if (mode === "create") {
        const created = await api.post<Task>(ROUTES.tasks(), {
          clientId,
          title: title.trim(),
          description,
          status,
          priority,
          ...(isAdmin ? { assignedTo: assignedTo || null } : {}),
          dueDate: dueDate || null,
        });
        toast.success("Task added.");
        onSaved(created);
      } else {
        const updated = await api.patch<Task>(ROUTES.tasks(), {
          id: task!.id,
          title: title.trim(),
          description,
          priority,
          ...(isAdmin ? { assignedTo: assignedTo || null } : {}),
          dueDate: dueDate || null,
        });
        toast.success("Task updated.");
        onSaved(updated);
      }
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task || busy) return;
    if (!confirm(`Delete "${task.title}"?`)) return;
    setBusy(true);
    try {
      await api.delete(ROUTES.tasks(), { id: task.id });
      toast.success("Task deleted.");
      onDeleted?.(task.id);
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New task" : canWrite ? "Edit task" : "Task"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite}
              placeholder="e.g. Update the homepage hero copy" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Details</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite}
              rows={4} placeholder="Anything the VA needs to do this well…" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {isAdmin && (
              <div className="flex flex-col gap-1.5">
                <Label>Assignee</Label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!canWrite}
                className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} disabled={!canWrite}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                <option value={1}>Low</option>
                <option value={2}>Normal</option>
                <option value={3}>High</option>
                <option value={4}>Urgent</option>
              </select>
            </div>
          </div>
          {/* Comments + activity trail (existing cards only) */}
          {mode === "edit" && task && (
            <TaskActivity taskId={task.id} onCommented={onCommented} />
          )}

          <div className="flex justify-between gap-2 pt-1">
            <div>
              {mode === "edit" && canWrite && (
                <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={busy} className="gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="border-zinc-700">
                {canWrite ? "Cancel" : "Close"}
              </Button>
              {canWrite && (
                <Button size="sm" onClick={save} disabled={busy || title.trim().length < 1} className="gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {mode === "create" ? "Add task" : "Save"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
