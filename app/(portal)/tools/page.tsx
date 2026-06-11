import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { TOOL_CATEGORIES } from "@/lib/tools/registry";
import { PageIntro } from "@/components/layout/PageIntro";
import { Wrench, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tools — RapidTal" };

export default async function ToolsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (!ctx.user.client_id) redirect("/dashboard");

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
    </div>
  );
}
