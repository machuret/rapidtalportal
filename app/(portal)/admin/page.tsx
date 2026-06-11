import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Brain, KanbanSquare, NotebookPen, AlertTriangle, CheckCircle2,
  Archive, Sparkles, Eye, ArrowRight, Users,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — RapidTal" };

/**
 * Super-admin home: one health row per client, so problems surface instead of
 * waiting to be noticed. All reads via the service-role client, aggregated in
 * memory — fine at agency scale (tens of clients), revisit if that changes.
 */
export default async function AdminOverviewPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const logSince = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);

  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: clients }, { data: users }, { data: vault }, { data: tasks }, { data: logs }, { count: errors24h }] = await Promise.all([
    admin.from("clients").select("id, name, created_at").is("archived_at", null).order("name"),
    admin.from("users").select("id, client_id, role"),
    admin.from("vault_items").select("client_id, status, created_at, tags"),
    admin.from("tasks").select("client_id, status, updated_at"),
    admin.from("daily_logs").select("client_id, user_id, log_date").gte("log_date", logSince),
    admin.from("app_errors").select("id", { count: "exact", head: true }).gte("created_at", since24h),
  ]);

  type U = { id: string; client_id: string | null; role: string };
  type V = { client_id: string; status: string; created_at: string; tags: string[] | null };
  type T = { client_id: string; status: string; updated_at: string };
  type L = { client_id: string; user_id: string; log_date: string };

  const rows = ((clients ?? []) as { id: string; name: string; created_at: string }[]).map((c) => {
    const cUsers = ((users ?? []) as U[]).filter((u) => u.client_id === c.id);
    const vas = cUsers.filter((u) => u.role === "va");
    const cVault = ((vault ?? []) as V[]).filter((v) => v.client_id === c.id);
    const cTasks = ((tasks ?? []) as T[]).filter((t) => t.client_id === c.id);
    const cLogs = ((logs ?? []) as L[]).filter((l) => l.client_id === c.id);

    const ready = cVault.filter((v) => v.status === "ready").length;
    const errors = cVault.filter((v) => v.status === "error").length;
    const hasDossier = cVault.some((v) => (v.tags ?? []).includes("dossier"));
    const openTasks = cTasks.filter((t) => t.status !== "done").length;
    const doneRecently = cTasks.filter((t) => t.status === "done" && t.updated_at >= since7d).length;
    const vasLogged = new Set(cLogs.map((l) => l.user_id)).size;

    const lastActivity = [
      ...cVault.map((v) => v.created_at),
      ...cTasks.map((t) => t.updated_at),
    ].sort().pop() ?? null;

    // Needs-attention flags — judgment, not just data.
    const flags: string[] = [];
    if (cVault.length === 0) flags.push("Brain is empty");
    else if (!hasDossier) flags.push("No dossier yet");
    if (errors > 0) flags.push(`${errors} vault item${errors !== 1 ? "s" : ""} failed indexing`);
    if (vas.length > 0 && vasLogged === 0) flags.push("No VA has logged in 2 days");
    if (vas.length === 0) flags.push("No VA assigned");

    return {
      ...c,
      vaCount: vas.length,
      adminCount: cUsers.length - vas.length,
      vaultTotal: cVault.length,
      ready,
      hasDossier,
      openTasks,
      doneRecently,
      vasLogged,
      lastActivity,
      flags,
    };
  });

  // Clients needing attention float to the top.
  rows.sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name));

  const totals = {
    clients: rows.length,
    vas: rows.reduce((s, r) => s + r.vaCount, 0),
    attention: rows.filter((r) => r.flags.length > 0).length,
  };

  const relTime = (iso: string | null) => {
    if (!iso) return "—";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <LayoutDashboard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Overview</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {totals.clients} client{totals.clients !== 1 ? "s" : ""} · {totals.vas} VA{totals.vas !== 1 ? "s" : ""}
            {totals.attention > 0 && <span className="text-amber-400"> · {totals.attention} need{totals.attention === 1 ? "s" : ""} attention</span>}
            {(errors24h ?? 0) > 0 && (
              <Link href="/admin/errors" className="text-red-400 hover:text-red-300"> · {errors24h} app error{errors24h !== 1 ? "s" : ""} · 24h</Link>
            )}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="surface-card rounded-xl p-12 text-center">
          <Users className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-300 font-semibold">No clients yet</p>
          <p className="text-zinc-500 text-sm mt-1">
            Create your first client, then feed its Vault and assign VAs.
          </p>
          <Link href="/admin/clients" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 mt-4">
            Go to Clients <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className={cn(
                "surface-card rounded-xl p-4",
                r.flags.length > 0 && "border-amber-500/30",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Identity */}
                <div className="min-w-[180px]">
                  <Link href={`/admin/clients/${r.id}`} className="text-sm font-semibold text-zinc-100 hover:text-white">
                    {r.name}
                  </Link>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {r.vaCount} VA{r.vaCount !== 1 ? "s" : ""} · {r.adminCount} admin{r.adminCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Brain */}
                <div className="flex items-center gap-2 min-w-[150px]">
                  <Brain className={cn("w-4 h-4", r.vaultTotal === 0 ? "text-zinc-600" : "text-violet-400")} />
                  <div className="text-xs">
                    <p className="text-zinc-300">{r.ready}/{r.vaultTotal} indexed</p>
                    <p className={cn(r.hasDossier ? "text-green-500" : "text-zinc-500")}>
                      {r.hasDossier ? "Dossier ✓" : "No dossier"}
                    </p>
                  </div>
                </div>

                {/* Tasks */}
                <div className="flex items-center gap-2 min-w-[130px]">
                  <KanbanSquare className="w-4 h-4 text-blue-400" />
                  <div className="text-xs">
                    <p className="text-zinc-300">{r.openTasks} open</p>
                    <p className="text-zinc-500">{r.doneRecently} done · 7d</p>
                  </div>
                </div>

                {/* Logs */}
                <div className="flex items-center gap-2 min-w-[130px]">
                  <NotebookPen className="w-4 h-4 text-emerald-400" />
                  <div className="text-xs">
                    <p className="text-zinc-300">{r.vasLogged}/{r.vaCount} VAs logged</p>
                    <p className="text-zinc-500">last 2 days</p>
                  </div>
                </div>

                {/* Last activity */}
                <div className="text-xs text-zinc-500 min-w-[80px]">
                  <p className="text-zinc-400">{relTime(r.lastActivity)}</p>
                  <p>activity</p>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-1 ml-auto">
                  <Link href={`/admin/vault?client=${r.id}`} title="Feed Vault"
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                    <Archive className="w-4 h-4" />
                  </Link>
                  <Link href={`/admin/ask?client=${r.id}`} title="Ask as Client"
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                    <Sparkles className="w-4 h-4" />
                  </Link>
                  <Link href="/supervision" title="Supervision"
                    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Flags */}
              {r.flags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                  {r.flags.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300 bg-amber-500/10 rounded-full px-2.5 py-1">
                      <AlertTriangle className="w-3 h-3" /> {f}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-800 text-[11px] text-green-500/80">
                  <CheckCircle2 className="w-3 h-3" /> Healthy
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
