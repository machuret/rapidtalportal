import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { getTool } from "@/lib/tools/registry";
import { MetaTool } from "@/components/tools/MetaTool";
import { GbpTool } from "@/components/tools/GbpTool";
import { KeywordBriefTool } from "@/components/tools/KeywordBriefTool";
import { ContentAuditorTool } from "@/components/tools/ContentAuditorTool";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ToolRunnerPage({ params }: { params: { category: string; tool: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const tool = getTool(params.category, params.tool);
  if (!tool || !tool.ready) notFound();

  const companyName = client?.name ?? "the company";

  return (
    <div className="max-w-3xl">
      <Link href={`/tools/${params.category}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to {params.category.toUpperCase()} tools
      </Link>

      {params.tool === "meta" && <MetaTool clientId={user.client_id} />}
      {params.tool === "gbp" && <GbpTool clientId={user.client_id} companyName={companyName} />}
      {params.tool === "keyword-brief" && <KeywordBriefTool clientId={user.client_id} />}
      {params.tool === "content-auditor" && <ContentAuditorTool clientId={user.client_id} />}
    </div>
  );
}
