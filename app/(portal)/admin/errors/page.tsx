import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { Bug, CheckCircle2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Errors — RapidTal" };

const SOURCE_CLS: Record<string, string> = {
  api: "text-red-300 bg-red-500/10",
  client: "text-amber-300 bg-amber-500/10",
  proxy: "text-blue-300 bg-blue-500/10",
};

export default async function AdminErrorsPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: errors }, { count: count24h }] = await Promise.all([
    admin.from("app_errors").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("app_errors").select("id", { count: "exact", head: true }).gte("created_at", since24h),
  ]);

  const rows = (errors ?? []) as {
    id: string; source: string; message: string; stack: string | null; url: string | null;
    user_id: string | null; client_id: string | null; created_at: string;
  }[];

  // Resolve names only for the users/clients referenced by the 100 shown rows,
  // rather than scanning the whole users/clients tables to build the lookup.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean) as string[]));
  const [{ data: users }, { data: clients }] = await Promise.all([
    admin.from("users").select("id, full_name, email").in("id", userIds),
    admin.from("clients").select("id, name").in("id", clientIds),
  ]);

  const userName = new Map(((users ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((u) => [u.id, u.full_name ?? u.email]));
  const clientName = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  return (
    <div>
      <AdminPageHeader icon={Bug} gradient="from-red-500 to-rose-600 shadow-red-500/20" title="Errors"
        subtitle={
          <>
            {(count24h ?? 0) > 0
              ? <span className="text-red-400">{count24h} error{count24h !== 1 ? "s" : ""} in the last 24 hours</span>
              : "Nothing in the last 24 hours."}{" "}
            Latest 100 shown.
          </>
        } />

      {rows.length === 0 ? (
        <div className="surface-card rounded-xl p-12 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
          <p className="text-zinc-300 font-semibold">No errors recorded</p>
          <p className="text-zinc-500 text-sm mt-1">Unhandled API and browser errors will appear here automatically.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((e) => (
            <details key={e.id} className="surface-card rounded-xl overflow-hidden group">
              <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 cursor-pointer hover:bg-zinc-800/40 transition-colors list-none">
                <span className={cn("text-3xs font-semibold uppercase rounded-full px-2 py-0.5 shrink-0", SOURCE_CLS[e.source] ?? "text-zinc-400 bg-zinc-800")}>
                  {e.source}
                </span>
                <span className="text-sm text-zinc-200 flex-1 min-w-[200px] truncate">{e.message}</span>
                {e.url && <span className="text-xs text-zinc-500 font-mono">{e.url}</span>}
                <span className="text-xs text-zinc-600 shrink-0">
                  {new Date(e.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </summary>
              <div className="px-4 pb-4 pt-1 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">
                  {e.user_id && <>User: <span className="text-zinc-400">{userName.get(e.user_id) ?? e.user_id}</span> · </>}
                  {e.client_id && <>Client: <span className="text-zinc-400">{clientName.get(e.client_id) ?? e.client_id}</span></>}
                  {!e.user_id && !e.client_id && "No user context"}
                </p>
                {e.stack
                  ? <pre className="text-2xs text-zinc-400 bg-zinc-950/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">{e.stack}</pre>
                  : <p className="text-xs text-zinc-600">No stack trace.</p>}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
