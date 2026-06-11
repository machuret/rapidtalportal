import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TOOL_CATEGORIES } from "@/lib/tools/registry";
import { PageIntro } from "@/components/layout/PageIntro";
import { Wrench, ArrowRight, History } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tools — RapidTal" };

// slug → { title, category } lookup for the history list.
const TOOL_INDEX = new Map(
  TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => [t.slug, { title: t.title, category: c.id }])),
);

export default async function ToolsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (!ctx.user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: runs } = await admin
    .from("tool_runs")
    .select("id, tool, input_summary, created_at")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(8);
  const recent = (runs ?? []) as { id: string; tool: string; input_summary: string | null; created_at: string }[];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Wrench className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Tools</h1>
          <p className="text-zinc-400 text-sm mt-1">AI helpers for everyday client work — grounded in their Vault and brand.</p>
        </div>
      </div>

      <PageIntro id="tools" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TOOL_CATEGORIES.map((cat) => {
          const ready = cat.tools.filter((t) => t.ready).length;
          return (
            <Link key={cat.id} href={`/tools/${cat.id}`}
              className="surface-card p-5 hover:border-zinc-600 transition-colors group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <cat.icon className="w-4.5 h-4.5 text-cyan-400" />
                </div>
                <p className="font-semibold text-zinc-100">{cat.title}</p>
                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 ml-auto transition-colors" />
              </div>
              <p className="text-sm text-zinc-400">{cat.description}</p>
              <p className="text-xs text-zinc-600 mt-2">{ready} tool{ready !== 1 ? "s" : ""} available</p>
            </Link>
          );
        })}
      </div>

      {/* Your recent runs */}
      {recent.length > 0 && (
        <div className="mt-8">
          <p className="label-section mb-2 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Your recent runs
          </p>
          <div className="surface-card divide-y divide-zinc-800 overflow-hidden">
            {recent.map((r) => {
              const meta = TOOL_INDEX.get(r.tool);
              const href = meta ? `/tools/${meta.category}/${r.tool}` : "/tools";
              return (
                <Link key={r.id} href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors">
                  <span className="text-sm text-zinc-200 shrink-0">{meta?.title ?? r.tool}</span>
                  {r.input_summary && <span className="text-sm text-zinc-500 truncate flex-1">“{r.input_summary}”</span>}
                  <span className="text-xs text-zinc-600 shrink-0 ml-auto">
                    {new Date(r.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
