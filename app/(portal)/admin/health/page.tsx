import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIGRATIONS } from "@/lib/migrations/manifest";
import { cn } from "@/lib/utils";
import { Activity, CheckCircle2, XCircle, AlertTriangle, Database, Clock, Brain } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Health — RapidTal Admin" };

/**
 * Platform health: detects the failure mode that bit us in production —
 * environment drift (migrations not applied, crons not running, embeddings
 * silently failing). Everything here is metadata; no client content is shown.
 */
export default async function AdminHealthPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();

  const [{ data: appliedRows }, schemaRes, { data: beats }, { data: clients }, { data: items }, { data: chunkRows }] = await Promise.all([
    admin.from("schema_migrations").select("version"),
    admin.rpc("health_schema_check"),
    admin.from("cron_heartbeats").select("name, ran_at, detail"),
    admin.from("clients").select("id, name").is("archived_at", null).order("name"),
    admin.from("vault_items").select("id, client_id, status, index_error"),
    admin.from("vault_chunks").select("item_id"),
  ]);

  // ── Migration drift ────────────────────────────────────────────────────────
  const applied = new Set(((appliedRows ?? []) as { version: string }[]).map((r) => r.version));
  const pending = MIGRATIONS.filter((m) => !applied.has(m));

  // ── Schema self-check (059's health_schema_check) ──────────────────────────
  const schemaChecks: { name: string; ok: boolean }[] = Array.isArray(schemaRes.data)
    ? (schemaRes.data as { name: string; ok: boolean }[])
    : [];
  const schemaFails = schemaChecks.filter((c) => !c.ok);
  const schemaUnavailable = !!schemaRes.error; // 059 not applied yet

  // ── Cron heartbeats ───────────────────────────────────────────────────────
  const EXPECTED_CRONS: { name: string; staleAfterH: number }[] = [
    { name: "tasks", staleAfterH: 26 },        // daily at 01:00
    { name: "vault-index", staleAfterH: 1 },   // every 15 min
  ];
  const beatByName = new Map(((beats ?? []) as { name: string; ran_at: string; detail: Record<string, unknown> }[]).map((b) => [b.name, b]));

  // ── Per-client brain health ───────────────────────────────────────────────
  const chunkedItems = new Set(((chunkRows ?? []) as { item_id: string }[]).map((c) => c.item_id));
  const rows = ((clients ?? []) as { id: string; name: string }[]).map((c) => {
    const mine = ((items ?? []) as { id: string; client_id: string; status: string; index_error: string | null }[])
      .filter((i) => i.client_id === c.id);
    const ready = mine.filter((i) => i.status === "ready");
    const indexed = ready.filter((i) => chunkedItems.has(i.id));
    const errored = mine.filter((i) => i.status === "error" || i.index_error);
    return { ...c, total: mine.length, ready: ready.length, indexed: indexed.length, errored: errored.length };
  });

  const ok = (v: boolean) => (v
    ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" aria-label="ok" />
    : <XCircle className="w-4 h-4 text-red-400 shrink-0" aria-label="failing" />);

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
          <Activity className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">System Health</h1>
          <p className="text-zinc-400 text-sm mt-1">Migration drift, schema integrity, background jobs, and per-client brain health.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Migrations */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><Database className="w-4 h-4" /> Migrations</p>
          {pending.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-green-400"><CheckCircle2 className="w-4 h-4" /> All {MIGRATIONS.length} repo migrations recorded as applied.</p>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-sm text-red-400 mb-2">
                <XCircle className="w-4 h-4" /> {pending.length} migration(s) NOT applied to this database:
              </p>
              <ul className="text-sm text-zinc-300 font-mono space-y-0.5">
                {pending.map((m) => <li key={m}>• {m}</li>)}
              </ul>
              <p className="text-xs text-zinc-500 mt-3">Run: <code className="bg-zinc-800 px-1.5 py-0.5 rounded">pnpm db:apply</code> (with SUPABASE_DB_URL set)</p>
            </div>
          )}
        </section>

        {/* Schema self-check */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Schema integrity</p>
          {schemaUnavailable ? (
            <p className="flex items-center gap-2 text-sm text-amber-400">
              <AlertTriangle className="w-4 h-4" /> health_schema_check() missing — apply migration 059 to enable this panel.
            </p>
          ) : (
            <ul className="space-y-1">
              {schemaChecks.map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-sm">
                  {ok(c.ok)}
                  <span className={cn("font-mono text-xs", c.ok ? "text-zinc-400" : "text-red-300")}>{c.name}</span>
                </li>
              ))}
              {schemaFails.length === 0 && schemaChecks.length > 0 && (
                <li className="text-xs text-zinc-500 pt-1">All {schemaChecks.length} critical objects present.</li>
              )}
            </ul>
          )}
        </section>

        {/* Cron heartbeats */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Background jobs</p>
          <ul className="space-y-2">
            {EXPECTED_CRONS.map(({ name, staleAfterH }) => {
              const beat = beatByName.get(name);
              const ageH = beat ? (Date.now() - new Date(beat.ran_at).getTime()) / 3_600_000 : Infinity;
              const healthy = ageH <= staleAfterH;
              return (
                <li key={name} className="flex items-start gap-2 text-sm">
                  {ok(healthy)}
                  <div>
                    <span className="text-zinc-200 font-medium">{name}</span>
                    <span className="text-zinc-500 ml-2">
                      {beat
                        ? `last ran ${ageH < 1 ? `${Math.round(ageH * 60)}m` : `${Math.round(ageH)}h`} ago · ${JSON.stringify(beat.detail)}`
                        : "never ran — is CRON_SECRET set in Vercel?"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Per-client brain health */}
        <section className="surface-card p-4 lg:col-span-2">
          <p className="label-section mb-3 flex items-center gap-2"><Brain className="w-4 h-4" /> Brain health (per client)</p>
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left font-medium py-2 pr-4">Client</th>
                <th className="text-right font-medium py-2 px-3">Docs</th>
                <th className="text-right font-medium py-2 px-3">Ready</th>
                <th className="text-right font-medium py-2 px-3">AI-indexed</th>
                <th className="text-right font-medium py-2 px-3">Errors</th>
                <th className="text-left font-medium py-2 pl-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-zinc-500">No clients yet.</td></tr>
              )}
              {rows.map((r) => {
                const coverage = r.ready ? r.indexed / r.ready : 1;
                const status = r.total === 0 ? "empty" : coverage >= 0.9 ? "healthy" : coverage >= 0.5 ? "partial" : "degraded";
                return (
                  <tr key={r.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="py-2 pr-4 text-zinc-200">{r.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{r.total}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{r.ready}</td>
                    <td className={cn("py-2 px-3 text-right tabular-nums", r.indexed < r.ready ? "text-amber-400" : "text-zinc-400")}>{r.indexed}</td>
                    <td className={cn("py-2 px-3 text-right tabular-nums", r.errored ? "text-red-400" : "text-zinc-500")}>{r.errored}</td>
                    <td className="py-2 pl-4">
                      <span className={cn("text-xs font-medium rounded-full px-2 py-0.5",
                        status === "healthy" && "bg-green-500/15 text-green-300",
                        status === "partial" && "bg-amber-500/15 text-amber-300",
                        status === "degraded" && "bg-red-500/15 text-red-300",
                        status === "empty" && "bg-zinc-700/50 text-zinc-400",
                      )}>{status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-zinc-500 mt-3">
            “AI-indexed” = ready docs with embeddings (semantic search works). Degraded clients answer from keyword search only — run “Index for AI search” in their Vault, then check vault-process logs if errors persist.
          </p>
        </section>
      </div>
    </div>
  );
}
