import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VaDashboard } from "@/components/dashboard/VaDashboard";
import { ClientDashboard } from "@/components/dashboard/ClientDashboard";
import { renderClientDashboard } from "./client-dashboard";
import { workHours } from "@/lib/tasks/metrics";
import { DEFAULT_PORTAL_TIMEZONE, todayInTimezone } from "@/lib/date-tz";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";
import { FeatureReadyReporter } from "@/components/layout/FeatureReadyReporter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — RapidTal" };

export default async function DashboardPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;

  if (user.role === "super_admin") redirect("/admin");

  // Clients get a purpose-built home (request / approve / value delivered),
  // not the VA workspace dashboard.
  if (user.role === "client_admin" && user.client_id) {
    const data = await withPortalDataTimeout(
      renderClientDashboard(user.client_id, user.full_name ?? user.email, user.id),
      "Client dashboard",
    );
    return <><FeatureReadyReporter feature="client_dashboard" /><ClientDashboard {...data} clientName={client?.name ?? ""} /></>;
  }

  // Any non-super user must belong to a client; without one there's nothing to
  // show (avoids a null client_id flowing into every query below).
  if (!user.client_id) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <h1 className="text-xl font-semibold text-white">Your account isn&apos;t linked to a client yet</h1>
        <p className="text-zinc-400 text-sm mt-2">Ask your RapidTal admin to assign you to a client, then refresh.</p>
      </div>
    );
  }

  const supabase = createAdminClient();
  const clientId = user.client_id;
  const timezone = user.timezone ?? DEFAULT_PORTAL_TIMEZONE;
  const now = new Date();
  const today = todayInTimezone(timezone, now);
  // Work from the already-resolved local calendar date so Sunday/Monday
  // boundaries cannot be shifted by the server's UTC clock.
  const wkStart = (() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: taskRows }, { data: myLog }, { data: timeWeek }, { data: contract },
    { count: unread }, { data: eventRows }, { data: catRows }, { data: userRows },
  ] = await withPortalDataTimeout(Promise.all([
    supabase.from("tasks").select("id, title, status, due_date, priority, category_id").eq("client_id", clientId).eq("assigned_to", user.id).neq("status", "done").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("daily_logs").select("id").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
    supabase.from("time_entries").select("started_at, ended_at").eq("user_id", user.id).eq("phase", "work").gte("work_date", wkStart),
    supabase.from("va_job_contracts").select("weekly_hours").eq("user_id", user.id).maybeSingle(),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", clientId).neq("sender_id", user.id).not("read_by", "cs", `{${user.id}}`),
    supabase.from("task_events").select("id, kind, body, user_id, created_at, task_id").eq("client_id", clientId).order("created_at", { ascending: false }).limit(6),
    supabase.from("task_categories").select("id, name").eq("client_id", clientId),
    supabase.from("users").select("id, full_name, email").eq("client_id", clientId),
  ]), "VA dashboard");

  const myTasks = (taskRows ?? []) as { id: string; title: string; status: string; due_date: string | null; priority: number; category_id: string | null }[];
  const catName = new Map(((catRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const userName = new Map(((userRows ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [u.id, u.full_name ?? u.email]));

  const hours = workHours((timeWeek ?? []) as { started_at: string; ended_at: string | null }[]);
  const weeklyGoal = (contract as { weekly_hours: number | null } | null)?.weekly_hours ?? null;

  const dueToday = myTasks.filter((t) => t.due_date === today);
  const reviewTasks = myTasks.filter((t) => t.status === "review");
  const activeTasks = myTasks
    .filter((t) => t.status === "todo" || t.status === "in_progress")
    .slice(0, 6)
    .map((t) => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date, priority: t.priority, category: t.category_id ? (catName.get(t.category_id) ?? null) : null }));

  // Resolve task titles for the activity feed (events may reference others' tasks).
  const titleById = new Map(myTasks.map((t) => [t.id, t.title]));
  const missing = Array.from(new Set(((eventRows ?? []) as { task_id: string }[]).map((e) => e.task_id))).filter((id) => !titleById.has(id));
  if (missing.length) {
    const { data: evTasks } = await supabase.from("tasks").select("id, title").in("id", missing);
    for (const t of (evTasks ?? []) as { id: string; title: string }[]) titleById.set(t.id, t.title);
  }
  const activity = ((eventRows ?? []) as { id: string; kind: string; body: string; user_id: string | null; created_at: string; task_id: string }[])
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.body,
      actor: e.user_id ? (userName.get(e.user_id) ?? "Someone") : "System",
      taskTitle: titleById.get(e.task_id) ?? null,
      createdAt: e.created_at,
    }));

  const dateLabel = now.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });

  return (
    <><FeatureReadyReporter feature="va_dashboard" /><VaDashboard
      firstName={(user.full_name ?? user.email).split(" ")[0]}
      dateLabel={dateLabel}
      todayIso={today}
      clientName={client?.name ?? ""}
      userId={user.id}
      kpis={{
        dueToday: dueToday.length,
        highPriority: dueToday.filter((t) => t.priority >= 3).length,
        hours,
        weeklyGoal,
        pendingReview: reviewTasks.length,
        reviewOverdue: reviewTasks.filter((t) => t.due_date && t.due_date < today).length,
        unread: unread ?? 0,
      }}
      activeTasks={activeTasks}
      activity={activity}
      loggedToday={!!myLog}
    /></>
  );
}
