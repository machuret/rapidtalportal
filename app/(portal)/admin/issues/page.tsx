import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { IssueStatusControl } from "@/components/my-job/IssueStatusControl";

export const dynamic = "force-dynamic";
export const metadata = { title: "Issues — RapidTal" };

// Issues escalate above the client to RapidTal for mediation, so this inbox is
// super_admin only (a VA may be raising a concern about their own client_admin).
const STATUS_CLS: Record<string, string> = {
  open: "text-amber-300 bg-amber-500/10",
  in_review: "text-blue-300 bg-blue-500/10",
  resolved: "text-green-300 bg-green-500/10",
};

export default async function AdminIssuesPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const [{ data: issues }, { data: users }, { data: clients }] = await Promise.all([
    admin.from("va_issues").select("id, user_id, client_id, category, subject, detail, status, created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("users").select("id, full_name, email"),
    admin.from("clients").select("id, name"),
  ]);

  const userName = new Map(((users ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [u.id, u.full_name ?? u.email]));
  const clientName = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const rows = (issues ?? []) as {
    id: string; user_id: string; client_id: string | null; category: string;
    subject: string; detail: string; status: string; created_at: string;
  }[];
  const openCount = rows.filter((r) => r.status !== "resolved").length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <AlertTriangle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Issues</h1>
          <p className="text-zinc-400 text-sm mt-1">Concerns raised by the team for RapidTal to mediate. {openCount} open.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500/70 mb-3" />
          <p className="text-zinc-400">No issues raised. All good.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5 shrink-0">{r.category}</span>
                  <p className="text-sm font-semibold text-zinc-100 truncate">{r.subject}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-[11px] font-semibold rounded-full px-2.5 py-0.5 capitalize", STATUS_CLS[r.status] ?? "bg-zinc-700 text-zinc-300")}>{r.status.replace("_", " ")}</span>
                  <IssueStatusControl id={r.id} initial={r.status} />
                </div>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap mb-2">{r.detail}</p>
              <p className="text-[11px] text-zinc-500">
                {userName.get(r.user_id) ?? "Unknown"}
                {r.client_id ? ` · ${clientName.get(r.client_id) ?? "—"}` : ""}
                {" · "}{new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
