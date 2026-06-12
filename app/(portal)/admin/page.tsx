import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  LayoutDashboard, Brain, KanbanSquare, NotebookPen, AlertTriangle, CheckCircle2,
  Archive, Sparkles, Eye, ArrowRight, Users,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — RapidTal" };

interface OverviewRow {
  client_id: string; client_name: string; user_count: number; va_count: number;
  vault_total: number; vault_ready: number; vault_error: number; has_dossier: boolean;
  open_tasks: number; done_recently: number; vas_logged: number; last_activity: string | null;
}

/**
 * Super-admin home: one health row per client. The per-client aggregation runs
 * in Postgres (admin_client_overview, migration 062) instead of pulling whole
 * tables into Node — scales as vault/tasks grow.
 */
export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: agg }, { count: errors24h }] = await Promise.all([
    admin.rpc("admin_client_overview"),
    admin.from("app_errors").select("id", { count: "exact", head: true }).gte("created_at", since24h),
  ]);

  const rows = ((agg ?? []) as OverviewRow[]).map((c) => {
    const flags: string[] = [];
    if (c.vault_total === 0) flags.push("Brain is empty");
    else if (!c.has_dossier) flags.push("No dossier yet");
    if (c.vault_error > 0) flags.push(`${c.vault_error} vault item${c.vault_error !== 1 ? "s" : ""} failed indexing`);
    if (c.va_count > 0 && c.vas_logged === 0) flags.push("No VA has logged in 2 days");
    if (c.va_count === 0) flags.push("No VA assigned");

    return {
      id: c.client_id,
      name: c.client_name,
      vaCount: c.va_count,
      adminCount: c.user_count - c.va_count,
      vaultTotal: c.vault_total,
      ready: c.vault_ready,
      hasDossier: c.has_dossier,
      openTasks: c.open_tasks,
      doneRecently: c.done_recently,
      vasLogged: c.vas_logged,
      lastActivity: c.last_activity,
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
      <AdminPageHeader
        icon={LayoutDashboard}
        gradient="from-amber-500 to-orange-600 shadow-amber-500/20"
        title="Overview"
        subtitle={
          <>
            {totals.clients} client{totals.clients !== 1 ? "s" : ""} · {totals.vas} VA{totals.vas !== 1 ? "s" : ""}
            {totals.attention > 0 && <span className="text-amber-400"> · {totals.attention} need{totals.attention === 1 ? "s" : ""} attention</span>}
            {(errors24h ?? 0) > 0 && (
              <Link href="/admin/errors" className="text-red-400 hover:text-red-300"> · {errors24h} app error{errors24h !== 1 ? "s" : ""} · 24h</Link>
            )}
          </>
        }
      />

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
