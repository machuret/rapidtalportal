import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIGRATIONS } from "@/lib/migrations/manifest";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Activity, CheckCircle2, XCircle, AlertTriangle, Database, Clock, Brain, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Health — RapidTal Admin" };

/**
 * Platform health: detects the failure mode that bit us in production —
 * environment drift (migrations not applied, crons not running, embeddings
 * silently failing). Everything here is metadata; no client content is shown.
 */
export default async function AdminHealthPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();

  const [{ data: appliedRows }, schemaRes, { data: beats }, { data: clients }, { data: items }, { count: recentErrorCount }] = await Promise.all([
    admin.from("schema_migrations").select("version"),
    admin.rpc("health_schema_check"),
    admin.from("cron_heartbeats").select("name, ran_at, detail"),
    admin.from("clients").select("id, name").is("archived_at", null).order("name"),
    // indexed_at marks an item as embedded (same signal score.ts uses) — so we
    // no longer load the entire vault_chunks table just to tell which are indexed.
    admin.from("vault_items").select("client_id, status, index_error, indexed_at"),
    admin.from("app_errors").select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()),
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

  // ── Brain learning counts (global) ─────────────────────────────────────────
  // brain_* tables aren't in the generated types; query loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;
  const [{ count: signalCount }, { count: undistilledCount }, { count: memoryCount }, { count: proposedCount }] = await Promise.all([
    a.from("brain_signals").select("id", { count: "exact", head: true }),
    a.from("brain_signals").select("id", { count: "exact", head: true }).is("distilled_at", null),
    a.from("brain_memory").select("id", { count: "exact", head: true }).eq("active", true),
    a.from("brain_memory").select("id", { count: "exact", head: true }).eq("status", "proposed"),
  ]);

  // Next-side Brain AI. Chat (distillation, onboarding) runs on OpenRouter OR
  // OpenAI; embeddings (memory dedup/reinforce + topic fit) are OpenAI-only and
  // optional. Surface both so a silent no-op is visible.
  const chatConfigured = !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
  const embeddingsConfigured = !!process.env.OPENAI_API_KEY;

  // ── Cron heartbeats ───────────────────────────────────────────────────────
  const EXPECTED_CRONS: { name: string; staleAfterH: number }[] = [
    { name: "tasks", staleAfterH: 26 },        // daily at 01:00
    { name: "vault-index", staleAfterH: 1 },   // every 15 min
    { name: "brain-distill", staleAfterH: 26 }, // daily at 02:30
  ];
  const beatByName = new Map(((beats ?? []) as { name: string; ran_at: string; detail: Record<string, unknown> }[]).map((b) => [b.name, b]));

  // ── Per-client brain health ───────────────────────────────────────────────
  // One pass over items → per-client tallies (was an O(items × clients) nested
  // filter, plus a full vault_chunks load — both removed).
  type Tally = { total: number; ready: number; indexed: number; errored: number };
  const byClient = new Map<string, Tally>();
  for (const i of (items ?? []) as { client_id: string; status: string; index_error: string | null; indexed_at: string | null }[]) {
    const t = byClient.get(i.client_id) ?? { total: 0, ready: 0, indexed: 0, errored: 0 };
    t.total++;
    if (i.status === "ready") { t.ready++; if (i.indexed_at) t.indexed++; }
    if (i.status === "error" || i.index_error) t.errored++;
    byClient.set(i.client_id, t);
  }
  const rows = ((clients ?? []) as { id: string; name: string }[]).map((c) => {
    const t = byClient.get(c.id) ?? { total: 0, ready: 0, indexed: 0, errored: 0 };
    return { ...c, ...t };
  });

  const ok = (v: boolean) => (v
    ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" aria-label="ok" />
    : <XCircle className="w-4 h-4 text-red-400 shrink-0" aria-label="failing" />);

  // ── Aggregate "needs attention" summary ────────────────────────────────────
  // Roll every panel's failures into one banner so a problem is visible the
  // instant the page loads, instead of only to someone who scans all four.
  const staleCrons = EXPECTED_CRONS.filter(({ name, staleAfterH }) => {
    const beat = beatByName.get(name);
    const ageH = beat ? (Date.now() - new Date(beat.ran_at).getTime()) / 3_600_000 : Infinity;
    return ageH > staleAfterH;
  });
  const degradedClients = rows.filter((r) => r.errored > 0 || (r.ready > 0 && r.indexed / r.ready < 0.5));
  const issues: string[] = [];
  if (pending.length) issues.push(`${pending.length} migration(s) not applied`);
  if (!schemaUnavailable && schemaFails.length) issues.push(`${schemaFails.length} schema object(s) missing`);
  for (const c of staleCrons) issues.push(`cron “${c.name}” is stale`);
  if (!chatConfigured) issues.push("No LLM key set — Brain learning/onboarding disabled (set OPENROUTER_API_KEY or OPENAI_API_KEY)");
  if (degradedClients.length) issues.push(`${degradedClients.length} client brain(s) degraded`);
  if (recentErrorCount && recentErrorCount > 0) issues.push(`${recentErrorCount} error(s) logged in the last 24h`);

  return (
    <div>
      <AdminPageHeader icon={Activity} gradient="from-red-500 to-orange-600 shadow-red-500/20"
        title="System Health" subtitle="Migration drift, schema integrity, background jobs, and per-client brain health." />

      {/* Top-level status banner */}
      <div role="status" className={cn("rounded-xl border p-4 mb-6 flex items-start gap-3",
        issues.length === 0
          ? "border-green-500/30 bg-green-500/10"
          : "border-red-500/30 bg-red-500/10")}>
        {issues.length === 0
          ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          : <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
        <div>
          <p className={cn("text-sm font-semibold", issues.length === 0 ? "text-green-300" : "text-red-300")}>
            {issues.length === 0 ? "All systems healthy" : `${issues.length} issue${issues.length === 1 ? "" : "s"} need attention`}
          </p>
          {issues.length > 0 && (
            <ul className="text-sm text-zinc-300 mt-1 space-y-0.5">
              {issues.map((i) => <li key={i}>• {i}</li>)}
            </ul>
          )}
          {recentErrorCount != null && recentErrorCount > 0 && (
            <a href="/admin/errors" className="text-xs text-zinc-400 hover:text-white underline underline-offset-2 mt-2 inline-block">
              View error log →
            </a>
          )}
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

        {/* Brain learning (global) */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><Brain className="w-4 h-4" /> Brain learning</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="stat-value text-white">{signalCount ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Feedback signals</p>
            </div>
            <div>
              <p className="stat-value text-white">{undistilledCount ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Awaiting distill</p>
            </div>
            <div>
              <p className="stat-value text-white">{memoryCount ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Active lessons</p>
            </div>
            <div>
              <p className={cn("stat-value", (proposedCount ?? 0) > 0 ? "text-amber-300" : "text-white")}>{proposedCount ?? 0}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Proposed (review)</p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 text-sm">
            <KeyRound className={cn("w-4 h-4 shrink-0 mt-0.5", chatConfigured ? "text-green-400" : "text-red-400")} />
            <span className={chatConfigured ? "text-zinc-400" : "text-red-300"}>
              {chatConfigured
                ? `LLM chat configured (${process.env.OPENROUTER_API_KEY ? "OpenRouter" : "OpenAI"}) — distillation and onboarding can run.`
                : "No LLM key — the Brain can't learn or draft. Set OPENROUTER_API_KEY or OPENAI_API_KEY in Vercel."}
            </span>
          </div>
          <div className="mt-2 flex items-start gap-2 text-sm">
            <KeyRound className={cn("w-4 h-4 shrink-0 mt-0.5", embeddingsConfigured ? "text-green-400" : "text-amber-400")} />
            <span className={embeddingsConfigured ? "text-zinc-400" : "text-amber-300"}>
              {embeddingsConfigured
                ? "Embeddings configured (OpenAI) — memory de-duplication and topic fit are active."
                : "Embeddings off (OpenAI only) — optional. Memory dedup/reinforce and embedding fit are skipped; everything else works."}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            Signals turn into lessons via the <code className="bg-zinc-800 px-1 py-0.5 rounded">brain-distill</code> cron (daily) or the “Distill now” button on Brain Analytics. Proposed lessons await admin approval in the memory panel.
          </p>
        </section>

        {/* Per-client brain health */}
        <section className="surface-card p-4 lg:col-span-2">
          <p className="label-section mb-3 flex items-center gap-2"><Brain className="w-4 h-4" /> Vault indexing (per client)</p>
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
