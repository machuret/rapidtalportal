import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TaskBoard, type Task, type BoardMember, type TaskCategory, type TaskRecurrence } from "@/components/tasks/TaskBoard";
import { AchievedStrip } from "@/components/tasks/AchievedStrip";
import { computeAchieved, type AchievedTask } from "@/lib/tasks/achieved";
import { PageIntro } from "@/components/layout/PageIntro";
import { KanbanSquare } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks — RapidTal" };

export default async function TasksPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const isAdmin = user.role === "client_admin" || user.role === "super_admin";

  const admin = createAdminClient();
  const [{ data: tasks }, { data: people }, { data: commentRows }, { data: cats }, { data: doneRows }, { data: recRows }] = await Promise.all([
    // The live board excludes archived cards.
    admin.from("tasks").select("*").eq("client_id", user.client_id).is("archived_at", null)
      .order("status").order("order_index").order("created_at"),
    admin.from("users").select("id, full_name, email, role").eq("client_id", user.client_id),
    admin.from("task_events").select("task_id").eq("client_id", user.client_id).eq("kind", "comment"),
    admin.from("task_categories").select("id, name, color").eq("client_id", user.client_id)
      .order("order_index").order("name"),
    // Achieved stats read ALL done cards (incl. archived) so the totals survive archiving.
    admin.from("tasks").select("title, status, completed_at, due_date, assigned_to")
      .eq("client_id", user.client_id).eq("status", "done"),
    // Recurrences only matter to admins (who manage them).
    isAdmin
      ? admin.from("task_recurrences").select("id, assigned_to, category_id, title, priority, frequency, interval, next_run_on, active")
          .eq("client_id", user.client_id).order("active", { ascending: false }).order("next_run_on")
      : Promise.resolve({ data: [] as TaskRecurrence[] }),
  ]);

  const commentCounts: Record<string, number> = {};
  for (const r of (commentRows ?? []) as { task_id: string }[]) {
    commentCounts[r.task_id] = (commentCounts[r.task_id] ?? 0) + 1;
  }

  const members: BoardMember[] = ((people ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((p) => ({ id: p.id, name: p.full_name ?? p.email }));

  // "Achieved" summary: a VA sees their own completed work; an admin sees the team's.
  const allTasks = (tasks ?? []) as Task[];
  const doneTasks = (doneRows ?? []) as (AchievedTask & { assigned_to: string | null })[];
  const achievedScope: "mine" | "team" = isAdmin ? "team" : "mine";
  const achieved = computeAchieved(
    isAdmin ? doneTasks : doneTasks.filter((t) => t.assigned_to === user.id),
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <KanbanSquare className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Tasks</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {client?.name ?? "Your team"}&apos;s shared board — everyone sees the same cards, live.
          </p>
        </div>
      </div>

      <PageIntro id="tasks" />

      <AchievedStrip summary={achieved} scope={achievedScope} />

      <TaskBoard
        initialTasks={allTasks}
        clientId={user.client_id}
        userId={user.id}
        isAdmin={isAdmin}
        members={members}
        categories={(cats ?? []) as TaskCategory[]}
        recurrences={(recRows ?? []) as TaskRecurrence[]}
        commentCounts={commentCounts}
      />
    </div>
  );
}
