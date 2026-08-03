import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { workHours, isOverdue, daysOverdue, isDueSoon, daysUntil } from "@/lib/tasks/metrics";
import {
  buildClientFirstSuccessJourney,
} from "@/lib/onboarding/client-first-success";
import { loadClientFirstSuccessProgress } from "@/lib/onboarding/server";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";
import { dedupeAttentionItems } from "@/lib/dashboard/attention";
import type { ClientAttentionItem, ClientDashboardProps } from "@/components/dashboard/ClientDashboard";

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
export async function renderClientDashboard(clientId: string, fullName: string, userId: string): Promise<ClientDashboardProps> {
  const admin = createAdminClient();
  const wkStart = weekStart();
  const wkStartIso = wkStart.toISOString();
  const wkStartDate = wkStart.toISOString().slice(0, 10);
  const today = localToday();
  const dueSoonEnd = (() => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 2);
    return date.toISOString().slice(0, 10);
  })();

  const [results, progressResult] = await Promise.all([
    Promise.all([
    admin.from("users").select("id, full_name, email").eq("client_id", clientId).eq("role", "va").order("full_name"),
    admin.from("task_categories").select("id, name, color").eq("client_id", clientId).order("name"),
    admin.from("tasks").select("id, title, description, status, assigned_to, completed_at, updated_at, due_date")
      .eq("client_id", clientId).is("archived_at", null).eq("status", "review").order("updated_at", { ascending: false }).limit(50),
    admin.from("tasks").select("id, title, description, status, assigned_to, completed_at, updated_at, due_date")
      .eq("client_id", clientId).is("archived_at", null).in("status", ["todo", "in_progress"])
      .not("due_date", "is", null).lte("due_date", dueSoonEnd).order("due_date", { ascending: true }).limit(50),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("client_id", clientId).is("archived_at", null).eq("status", "in_progress"),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("client_id", clientId).is("archived_at", null).eq("status", "todo"),
    admin.from("tasks").select("id, title, assigned_to, completed_at", { count: "exact" }).eq("client_id", clientId)
      .is("archived_at", null).eq("status", "done").gte("completed_at", wkStartIso).order("completed_at", { ascending: false }).limit(8),
    admin.from("time_entries").select("started_at, ended_at").eq("client_id", clientId).eq("phase", "work").gte("work_date", wkStartDate),
    admin.from("content_projects").select("id,title,updated_at").eq("client_id", clientId).in("status", ["active", "saved"]).eq("current_step", "approve").order("updated_at", { ascending: false }).limit(8),
    admin.from("vault_items").select("id,title,updated_at").eq("client_id", clientId).eq("status", "error").order("updated_at", { ascending: false }).limit(8),
    admin.from("competitor_sources").select("id,url,updated_at").eq("client_id", clientId).eq("status", "error").order("updated_at", { ascending: false }).limit(5),
    admin.from("prospecting_jobs").select("id,error_message,updated_at").eq("client_id", clientId).eq("status", "error").order("updated_at", { ascending: false }).limit(5),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("client_id", clientId).neq("sender_id", userId).not("read_by", "cs", `{${userId}}`),
    ]),
    withPortalDataTimeout(
      loadClientFirstSuccessProgress(clientId),
      "Starter progress",
      3_000,
    )
      .then((data) => ({ data, error: null }))
      .catch((error: unknown) => ({ data: null, error })),
  ]);

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw new Error(`Client dashboard data could not be loaded: ${firstError.message}`);

  const [
    { data: vaRows }, { data: catRows }, { data: reviewRows }, { data: dueRows },
    { count: inProgressCount }, { count: todoCount }, { data: deliveredRows, count: completedThisWeekCount },
    { data: timeRows }, { data: contentApprovalRows }, { data: vaultFailureRows },
    { data: competitorFailureRows }, { data: leadFailureRows }, { count: unreadMessages },
  ] = results;

  const vas = ((vaRows ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((v) => ({ id: v.id, name: v.full_name ?? v.email }));
  const nameById = new Map(vas.map((v) => [v.id, v.name]));

  const awaiting = ((reviewRows ?? []) as TaskRow[])
    .map((t) => ({ id: t.id, title: t.title, description: t.description ?? "", assigneeName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null, updatedAt: t.updated_at }));

  // Intervention signal: work still in flight that's blown past its due date.
  // Most-overdue first, capped — this is a nudge, not the full task board.
  const dueTasks = (dueRows ?? []) as TaskRow[];
  const overdue = dueTasks
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

  // Proactive tier: in-flight work due in the next 48h (soonest first).
  const dueSoon = dueTasks
    .filter((t) => isDueSoon(t, today))
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null,
      dueDate: t.due_date as string,
      daysUntil: daysUntil(t.due_date as string, today),
    }));

  const completedThisWeek = completedThisWeekCount ?? 0;
  const recentDelivered = ((deliveredRows ?? []) as TaskRow[])
    .map((t) => ({ id: t.id, title: t.title, completedAt: t.completed_at as string, assigneeName: t.assigned_to ? nameById.get(t.assigned_to) ?? null : null }));

  const attention: ClientAttentionItem[] = dedupeAttentionItems([
    ...overdue.map((task) => ({ id: `overdue:${task.id}`, title: task.title, detail: `${task.daysOverdue === 1 ? "1 day" : `${task.daysOverdue} days`} late${task.assigneeName ? ` · ${task.assigneeName}` : ""}`, href: `/tasks?card=${task.id}`, severity: "critical" as const })),
    ...awaiting.slice(0, 6).map((task) => ({ id: `review:${task.id}`, title: task.title, detail: "VA work is waiting for your approval", href: `/tasks?card=${task.id}`, severity: "action" as const })),
    ...dueSoon.map((task) => ({ id: `due:${task.id}`, title: task.title, detail: `${dueLabelForDashboard(task.daysUntil)}${task.assigneeName ? ` · ${task.assigneeName}` : ""}`, href: `/tasks?card=${task.id}`, severity: "warning" as const })),
    ...((contentApprovalRows ?? []) as Array<{ id: string; title: string }>).map((project) => ({ id: `content:${project.id}`, title: project.title, detail: "Content is ready for approval", href: `/content/projects?open=${project.id}`, severity: "action" as const })),
    ...((vaultFailureRows ?? []) as Array<{ id: string; title: string }>).map((item) => ({ id: `vault:${item.id}`, title: item.title, detail: "Company knowledge needs processing attention", href: `/vault?open=${item.id}`, severity: "warning" as const })),
    ...((competitorFailureRows ?? []) as Array<{ id: string; url: string }>).map((source) => ({ id: `competitor:${source.id}`, title: source.url, detail: "Competitor collection needs retry", href: "/competitors", severity: "warning" as const })),
    ...((leadFailureRows ?? []) as Array<{ id: string; error_message: string | null }>).map((job) => ({ id: `lead:${job.id}`, title: "Lead collection needs attention", detail: job.error_message || "Open Lead Generation to retry", href: "/lead-generation", severity: "warning" as const })),
    ...((unreadMessages ?? 0) > 0 ? [{ id: "messages:unread", title: `${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`, detail: "Your VA may be waiting for a response", href: "/messages", severity: "action" as const }] : []),
  ]).sort((left, right) => attentionPriority(left.severity) - attentionPriority(right.severity)).slice(0, 12);

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

  const milestoneSet = new Set(progressResult.data?.milestones ?? []);
  const readyDocumentCount = progressResult.data?.readyDocumentCount ?? 0;
  const firstSuccess = buildClientFirstSuccessJourney({
    companyComplete: milestoneSet.has("company_confirmed"),
    readyDocumentCount,
    documentsMilestoneReached: milestoneSet.has("documents_ready"),
    voiceConfigured: milestoneSet.has("voice_configured"),
    coachQuestionCount: milestoneSet.has("coach_question_asked") ? 1 : 0,
    draftCount: milestoneSet.has("content_draft_created") ? 1 : 0,
    requestedTaskCount: milestoneSet.has("va_task_requested") ? 1 : 0,
    vaAssigned: vas.length > 0,
  });

  return {
    clientId,
    firstName: (fullName || "there").split(" ")[0],
    clientName: "", // filled by the page from ctx.client if desired
    vas,
    categories: (catRows ?? []) as { id: string; name: string; color: string }[],
    awaiting,
    overdue,
    dueSoon,
    attention,
    stats: {
      inProgress: inProgressCount ?? 0,
      todo: todoCount ?? 0,
      completedThisWeek,
      hoursThisWeek,
      planHours,
    },
    recentDelivered,
    firstSuccess,
    firstSuccessUnavailable: progressResult.error !== null,
  };
}

function attentionPriority(severity: ClientAttentionItem["severity"]) {
  return severity === "critical" ? 0 : severity === "action" ? 1 : 2;
}

function dueLabelForDashboard(days: number) {
  return days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}
