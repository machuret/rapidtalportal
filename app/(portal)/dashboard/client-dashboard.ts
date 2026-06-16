import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { workHours, isOverdue, daysOverdue } from "@/lib/tasks/metrics";
import type { ClientDashboardProps } from "@/components/dashboard/ClientDashboard";

/** Local-midnight of the most recent Monday. */
function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Today as a 'YYYY-MM-DD' local-calendar date (matches how due_date is stored). */
function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface TaskRow {
  id: string; title: string; description: string | null; status: string;
  assigned_to: string | null; completed_at: string | null; updated_at: string; due_date: string | null;
}

/** Assemble everything the client home needs. Service-role reads, client-scoped. */
export async function renderClientDashboard(clientId: string, fullName: string): Promise<ClientDashboardProps> {
  const admin = createAdminClient();
  const wkStart = weekStart();
  const wkStartIso = wkStart.toISOString();
  const wkStartDate = wkStart.toISOString().slice(0, 10);

  const [{ data: vaRows }, { data: catRows }, { data: taskRows }, { data: timeRows }, { data: dna }, { count: vaultReady }, { count: taskCount }] = await Promise.all([
    admin.from("users").select("id, full_name, email").eq("client_id", clientId).eq("role", "va").order("full_name"),
    admin.from("task_categories").select("id, name, color").eq("client_id", clientId).order("name"),
    admin.from("tasks").select("id, title, description, status, assigned_to, completed_at, updated_at, due_date")
      .eq("client_id", clientId).is("archived_at", null),
    admin.from("time_entries").select("started_at, ended_at").eq("client_id", clientId).eq("phase", "work").gte("work_date", wkStartDate),
    admin.from("company_dna").select("company_name, services").eq("client_id", clientId).maybeSingle(),
    admin.from("vault_items").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "ready"),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);

  const vas = ((vaRows ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((v) => ({ id: v.id, name: v.full_name ?? v.email }));
  const nameById = new Map(vas.map((v) => [v.id, v.name]));

  const tasks = (taskRows ?? []) as TaskRow[];
  const awaiting = tasks
    .filter((t) => t.status === "review")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((t) => ({ id: t.id, title: t.title, description: t.description ?? "", assigneeName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null, updatedAt: t.updated_at }));

  // Intervention signal: work still in flight that's blown past its due date.
  // Most-overdue first, capped — this is a nudge, not the full task board.
  const today = localToday();
  const overdue = tasks
    .filter((t) => isOverdue(t, today))
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null,
      dueDate: t.due_date as string,
      daysOverdue: daysOverdue(t.due_date as string, today),
    }));

  const completedThisWeek = tasks.filter((t) => t.status === "done" && t.completed_at && t.completed_at >= wkStartIso).length;
  const recentDelivered = tasks
    .filter((t) => t.status === "done" && t.completed_at)
    .sort((a, b) => (b.completed_at as string).localeCompare(a.completed_at as string))
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title, completedAt: t.completed_at as string, assigneeName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null }));

  const hoursThisWeek = workHours((timeRows ?? []) as { started_at: string; ended_at: string | null }[]);

  // Planned weekly hours = sum of the VAs' contracts (when present).
  let planHours: number | null = null;
  if (vas.length) {
    const { data: contracts } = await admin
      .from("va_job_contracts").select("weekly_hours").in("user_id", vas.map((v) => v.id));
    const sum = ((contracts ?? []) as { weekly_hours: number | null }[])
      .reduce((acc, c) => acc + (c.weekly_hours ?? 0), 0);
    if (sum > 0) planHours = Math.round(sum);
  }

  const dnaRow = dna as { company_name: string | null; services: string | null } | null;

  return {
    clientId,
    firstName: (fullName || "there").split(" ")[0],
    clientName: "", // filled by the page from ctx.client if desired
    vas,
    categories: (catRows ?? []) as { id: string; name: string; color: string }[],
    awaiting,
    overdue,
    stats: {
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      todo: tasks.filter((t) => t.status === "todo").length,
      completedThisWeek,
      hoursThisWeek,
      planHours,
    },
    recentDelivered,
    onboarding: {
      dna: !!(dnaRow && (dnaRow.company_name?.trim() || dnaRow.services?.trim())),
      docs: (vaultReady ?? 0) > 0,
      va: vas.length > 0,
      firstTask: (taskCount ?? 0) > 0,
    },
  };
}
