"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Trash2, Save, Inbox, ThumbsUp, RotateCcw } from "lucide-react";
import { TaskActivity } from "./TaskActivity";
import type { TaskCategory } from "./CategoryManager";
import type { Task, TaskStatus, BoardMember } from "./types";

export function TaskDialog({
  mode, task, status, clientId, isAdmin, canWrite = true, members, categories, initialAssignedTo, starterMode = false, onClose, onSaved, onDeleted, onCommented,
}: {
  mode: "create" | "edit";
  task?: Task;
  status: TaskStatus;
  clientId: string;
  isAdmin: boolean;
  canWrite?: boolean;
  members: BoardMember[];
  categories: TaskCategory[];
  /** Optional create-mode seed (e.g. the only VA on the team). */
  initialAssignedTo?: string;
  /** First-success flow: title, useful detail and VA only. */
  starterMode?: boolean;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted?: (id: string) => void;
  onCommented?: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? initialAssignedTo ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState(task?.priority ?? 2);
  const [categoryId, setCategoryId] = useState(task?.category_id ?? "");
  // Status is editable here too — drag-and-drop doesn't work on touch
  // devices, so the dialog must not be the only way to move a card.
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(task?.status ?? status);
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  // Admins can sign off a card that's awaiting review without leaving the board
  // (the structured note + VA notification only fire through this path — dragging
  // a Review card straight to Done would skip them).
  const canReview = isAdmin && mode === "edit" && task?.status === "review";

  async function decide(decision: "approve" | "changes") {
    if (!task || busy) return;
    if (decision === "changes" && !reviewNote.trim()) return;
    setBusy(true);
    try {
      const updated = await api.post<Task>(ROUTES.taskReview(), {
        id: task.id, decision, note: reviewNote.trim() || undefined,
      });
      toast.success(decision === "approve" ? "Approved — your VA has been notified." : "Sent back with your notes.");
      onSaved(updated);
    } catch { /* api-client surfaces a toast */ } finally { setBusy(false); }
  }

  async function save() {
    if (title.trim().length < 1 || busy) return;
    if (starterMode && isAdmin && !assignedTo) {
      toast.error("Choose the VA who should receive this request.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        const created = await api.post<Task>(ROUTES.tasks(), {
          clientId,
          title: title.trim(),
          description,
          status,
          priority,
          categoryId: categoryId || null,
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
          status: taskStatus,
          priority,
          categoryId: categoryId || null,
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
          <DialogTitle>{starterMode ? "Request work from your VA" : mode === "create" ? "New task" : canWrite ? "Edit task" : "Task"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          {canReview && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2.5">
              <p className="text-sm font-medium text-amber-200 flex items-center gap-1.5">
                <Inbox className="w-4 h-4" /> Awaiting your review
              </p>
              <Textarea
                value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2}
                placeholder="Optional note for your VA (required to request changes)…"
                className="bg-zinc-800 border-zinc-700"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy || !reviewNote.trim()}
                  onClick={() => decide("changes")} className="gap-1.5 border-zinc-700">
                  <RotateCcw className="w-3.5 h-3.5" /> Request changes
                </Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => decide("approve")} className="gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />} Approve
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{starterMode ? "What do you need?" : "Title"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite}
              placeholder="e.g. Update the homepage hero copy" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{starterMode ? "Helpful details" : "Details"}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite}
              rows={4} placeholder="Anything the VA needs to do this well…" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {mode === "edit" && (
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as TaskStatus)} disabled={!canWrite}
                  aria-label="Task status"
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  {isAdmin && <option value="done">Done</option>}
                </select>
              </div>
            )}
            {isAdmin && (!starterMode || members.length > 1) && (
              <div className="flex flex-col gap-1.5">
                <Label>Assignee</Label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            {!starterMode && <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!canWrite}
                className="bg-zinc-800 border-zinc-700" />
            </div>}
            {!starterMode && <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} disabled={!canWrite}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                <option value={1}>Low</option>
                <option value={2}>Normal</option>
                <option value={3}>High</option>
                <option value={4}>Urgent</option>
              </select>
            </div>}
            {!starterMode && categories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!canWrite}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300">
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
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
                <Button size="sm" onClick={save} disabled={busy || title.trim().length < 1 || (starterMode && isAdmin && !assignedTo)} className="gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {starterMode ? "Send request" : mode === "create" ? "Add task" : "Save"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
