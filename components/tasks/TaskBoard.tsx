"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import { categoryColor } from "@/lib/tasks/category-colors";
import { CategoryManager, type TaskCategory } from "./CategoryManager";
import { RecurrenceManager, type TaskRecurrence } from "./RecurrenceManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, CalendarDays, Loader2, Settings2, Repeat, MessageSquare } from "lucide-react";
import { TaskDialog } from "./TaskDialog";
import type { Task, TaskStatus, BoardMember } from "./types";

export type { Task, TaskStatus, BoardMember };
export type { TaskCategory, TaskRecurrence };

const UNCATEGORIZED = "__none__";

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
  categories?: TaskCategory[];
  recurrences?: TaskRecurrence[];
  commentCounts?: Record<string, number>;
}

export function TaskBoard({ initialTasks, clientId, userId, isAdmin, members, categories = [], recurrences = [], commentCounts }: TaskBoardProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [counts, setCounts] = useState<Record<string, number>>(commentCounts ?? {});
  const [editing, setEditing] = useState<Task | null>(null);
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [managingCats, setManagingCats] = useState(false);
  const [managingRecur, setManagingRecur] = useState(false);
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
          if (t.archived_at) return; // archived cards never join the live board
          setTasks((p) => (p.some((x) => x.id === t.id) ? p.map((x) => (x.id === t.id ? t : x)) : [...p, t]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const t = payload.new as Task;
          // An archive sweep removes the card from the board in real time.
          setTasks((p) => (t.archived_at ? p.filter((x) => x.id !== t.id) : p.map((x) => (x.id === t.id ? t : x))));
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

  // O(1) lookups instead of a per-card Array.find() — these run once per card on
  // every render, so on a large board the linear scans add up fast.
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const memberName = (id: string | null) => (id ? memberMap.get(id) ?? null : null);
  const categoryById = (id: string | null) => (id ? categoryMap.get(id) ?? null : null);
  const canMove = (t: Task) => isAdmin || t.assigned_to === userId || t.created_by === userId;

  const matchesFilter = (t: Task) =>
    filterCat === null ? true : filterCat === UNCATEGORIZED ? !t.category_id : t.category_id === filterCat;

  // Compute the four columns once per (tasks, filter) change rather than
  // re-filtering + re-sorting the whole list four times on every render.
  const columnItems = useMemo(() => {
    const result = {} as Record<TaskStatus, Task[]>;
    for (const col of COLUMNS) {
      result[col.key] = tasks
        .filter((t) => t.status === col.key && matchesFilter(t))
        .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at));
    }
    return result;
    // matchesFilter is a pure function of filterCat; depending on filterCat is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filterCat]);

  const byCol = (col: TaskStatus) => columnItems[col];

  // Midnight today, computed once per render and reused by every card's
  // overdue check (was previously allocated twice per card).
  const todayMidnight = new Date(new Date().toDateString());

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

  const pill = (active: boolean) => cn(
    "inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 transition-colors border",
    active ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "text-zinc-400 bg-zinc-900 border-zinc-700 hover:text-white hover:border-zinc-500",
  );

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-3 -mt-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {(categories.length > 0 || isAdmin) && (
            <>
              <button onClick={() => setFilterCat(null)} className={pill(filterCat === null)}>All</button>
              {categories.map((c) => (
                <button key={c.id} onClick={() => setFilterCat(c.id)} className={pill(filterCat === c.id)}>
                  <span className={cn("w-2 h-2 rounded-full", categoryColor(c.color).swatch)} />
                  {c.name}
                </button>
              ))}
              {categories.length > 0 && (
                <button onClick={() => setFilterCat(UNCATEGORIZED)} className={pill(filterCat === UNCATEGORIZED)}>None</button>
              )}
              {isAdmin && (
                <button onClick={() => setManagingCats(true)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1">
                  <Settings2 className="w-3.5 h-3.5" /> Categories
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setManagingRecur(true)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1">
                  <Repeat className="w-3.5 h-3.5" /> Recurring
                </button>
              )}
            </>
          )}
        </div>
        <span className={cn(
          "inline-flex items-center gap-1.5 text-2xs font-medium rounded-full px-2.5 py-1 transition-colors shrink-0",
          live ? "text-green-400 bg-green-500/10" : "text-zinc-500 bg-zinc-800",
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", live ? "bg-green-400 animate-pulse" : "bg-zinc-500")} />
          {live ? "Live" : "Connecting…"}
        </span>
      </div>

      {isAdmin && (
        <CategoryManager
          clientId={clientId}
          categories={categories}
          open={managingCats}
          onClose={() => setManagingCats(false)}
          onChanged={() => router.refresh()}
        />
      )}
      {isAdmin && (
        <RecurrenceManager
          clientId={clientId}
          recurrences={recurrences}
          members={members}
          categories={categories}
          open={managingRecur}
          onClose={() => setManagingRecur(false)}
          onChanged={() => router.refresh()}
        />
      )}
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
                  aria-label={`Add task to ${col.label}`}
                  className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2 p-2.5 pt-1 min-h-[80px]">
                {items.map((t) => {
                  const name = memberName(t.assigned_to);
                  // `todayMidnight` is computed once per render (above), not once per card.
                  const overdue = t.due_date && t.status !== "done" && new Date(t.due_date) < todayMidnight;
                  const cat = categoryById(t.category_id);
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
                      {(name || t.due_date || (counts[t.id] ?? 0) > 0 || t.priority > 2 || cat) && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {cat && (
                            <span className={cn("inline-flex items-center gap-1 text-2xs font-medium rounded-full px-2 py-0.5", categoryColor(cat.color).chip)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", categoryColor(cat.color).dot)} />
                              {cat.name}
                            </span>
                          )}
                          {t.priority > 2 && t.status !== "done" && (
                            <span className={cn("inline-flex items-center text-2xs font-medium rounded-full px-2 py-0.5", PRIORITY[t.priority].chip)}>
                              {PRIORITY[t.priority].label}
                            </span>
                          )}
                          {(counts[t.id] ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-2xs text-zinc-400 bg-zinc-800 rounded-full px-2 py-0.5">
                              <MessageSquare className="w-3 h-3" />
                              {counts[t.id]}
                            </span>
                          )}
                          {name && (
                            <span className="inline-flex items-center gap-1 text-2xs text-zinc-400 bg-zinc-800 rounded-full px-2 py-0.5">
                              <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-3xs font-semibold flex items-center justify-center text-zinc-300">
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                              {name.split(" ")[0]}
                            </span>
                          )}
                          {t.due_date && (
                            <span className={cn("inline-flex items-center gap-1 text-2xs rounded-full px-2 py-0.5",
                              overdue ? "text-red-400 bg-red-500/10" : "text-zinc-400 bg-zinc-800")}>
                              <CalendarDays className="w-3 h-3" />
                              {formatDate(t.due_date, { day: "numeric", month: "short" })}
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
          categories={categories}
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
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(t) => { setTasks((p) => p.map((x) => (x.id === t.id ? t : x))); setEditing(null); }}
          onDeleted={(id) => { setTasks((p) => p.filter((x) => x.id !== id)); setEditing(null); }}
          onCommented={() => setCounts((p) => ({ ...p, [editing.id]: (p[editing.id] ?? 0) + 1 }))}
        />
      )}
    </>
  );
}
