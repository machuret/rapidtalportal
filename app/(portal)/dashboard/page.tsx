import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VaDashboard } from "@/components/dashboard/VaDashboard";
import { VaDayStrip, AdminTeamStrip } from "@/components/dashboard/DayStrips";
import { ClientDashboard } from "@/components/dashboard/ClientDashboard";
import { renderClientDashboard } from "./client-dashboard";
import { sumWorkHours } from "@/lib/tasks/metrics";

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
    const data = await renderClientDashboard(user.client_id, user.full_name ?? user.email);
    return <ClientDashboard {...data} clientName={client?.name ?? ""} />;
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

  const [
    kbResult,
    recentResult,
    statusResult,
    vaultResult,
    sopsResult,
  ] = await Promise.all([
    supabase.from("kb_entries").select("id, question, answer").eq("client_id", clientId).order("generated_at", { ascending: false }).limit(50),
    supabase.from("crm_contacts").select("id, first_name, last_name, company, status, updated_at").eq("client_id", clientId).is("archived_at", null).order("updated_at", { ascending: false }).limit(8),
    supabase.rpc("get_contact_status_counts", { p_client_id: clientId }),
    supabase.from("vault_items").select("*", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "ready"),
    supabase.from("sops").select("*", { count: "exact", head: true }).eq("client_id", clientId),
  ]);

  if (kbResult.error)     console.error("[dashboard] kb_entries:", kbResult.error.message);
  if (recentResult.error) console.error("[dashboard] crm_contacts recent:", recentResult.error.message);
  if (statusResult.error) console.error("[dashboard] status_counts:", statusResult.error.message);
  if (vaultResult.error)  console.error("[dashboard] vault_items:", vaultResult.error.message);
  if (sopsResult.error)   console.error("[dashboard] sops:", sopsResult.error.message);

  const statusCounts = (statusResult.data ?? []) as { status: string; count: number }[];

  // ── Role-aware day strip ─────────────────────────────────────────────
  const isAdmin = user.role === "client_admin";
  const today = new Date().toISOString().slice(0, 10);
  let topSlot: React.ReactNode = null;

  if (isAdmin) {
    const [{ data: vas }, { data: logsToday }, { data: openTaskRows }, { data: timeToday }] = await Promise.all([
      supabase.from("users").select("id").eq("client_id", clientId).eq("role", "va"),
      supabase.from("daily_logs").select("user_id").eq("client_id", clientId).eq("log_date", today),
      supabase.from("tasks").select("id, status").eq("client_id", clientId).neq("status", "done"),
      supabase.from("time_entries").select("started_at, ended_at").eq("client_id", clientId).eq("phase", "work").eq("work_date", today),
    ]);
    const open = (openTaskRows ?? []) as { status: string }[];
    const hoursToday = sumWorkHours((timeToday ?? []) as { started_at: string; ended_at: string | null }[]);
    topSlot = (
      <AdminTeamStrip
        vaCount={(vas ?? []).length}
        loggedToday={new Set(((logsToday ?? []) as { user_id: string }[]).map((l) => l.user_id)).size}
        openTasks={open.length}
        reviewTasks={open.filter((t) => t.status === "review").length}
        hoursToday={hoursToday}
      />
    );
  } else {
    const [{ data: myTasks }, { data: myLog }] = await Promise.all([
      supabase.from("tasks").select("id, status, due_date").eq("client_id", clientId).eq("assigned_to", user.id).neq("status", "done"),
      supabase.from("daily_logs").select("id").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
    ]);
    const open = (myTasks ?? []) as { due_date: string | null }[];
    topSlot = (
      <VaDayStrip
        openTasks={open.length}
        dueToday={open.filter((t) => t.due_date === today).length}
        overdue={open.filter((t) => t.due_date && t.due_date < today).length}
        loggedToday={!!myLog}
      />
    );
  }

  return (
    <VaDashboard
      userName={user.full_name ?? user.email}
      userId={user.id}
      clientName={client?.name ?? ""}
      kbEntries={(kbResult.data ?? []) as { id: string; question: string; answer: string }[]}
      recentContacts={(recentResult.data ?? []) as { id: string; first_name: string; last_name: string | null; company: string | null; status: string; updated_at: string }[]}
      statusCounts={statusCounts}
      vaultCount={vaultResult.count ?? 0}
      sopCount={sopsResult.count ?? 0}
      topSlot={topSlot}
    />
  );
}
