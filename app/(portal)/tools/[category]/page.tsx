import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { getCategory } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ToolCategoryPage({ params }: { params: { category: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (!ctx.user.client_id) redirect("/dashboard");

  const cat = getCategory(params.category);
  if (!cat) notFound();

  return (
    <div>
      <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> All tools
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <cat.icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{cat.title} tools</h1>
          <p className="text-zinc-400 text-sm mt-1">{cat.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cat.tools.map((tool) => {
          const card = (
            <div className={cn("surface-card p-5 h-full transition-colors", tool.ready ? "hover:border-zinc-600 group" : "opacity-60")}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <tool.icon className="w-4.5 h-4.5 text-cyan-400" />
                </div>
                <p className="font-semibold text-zinc-100">{tool.title}</p>
                {tool.ready
                  ? <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 ml-auto transition-colors" />
                  : <span className="text-3xs uppercase tracking-wide text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5 ml-auto">Soon</span>}
              </div>
              <p className="text-sm text-zinc-400">{tool.description}</p>
            </div>
          );
          return tool.ready
            ? <Link key={tool.slug} href={`/tools/${cat.id}/${tool.slug}`}>{card}</Link>
            : <div key={tool.slug}>{card}</div>;
        })}
      </div>
    </div>
  );
}
