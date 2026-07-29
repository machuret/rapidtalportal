import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTool, getCategory } from "@/lib/tools/registry";
import { MetaTool } from "@/components/tools/MetaTool";
import { GbpTool } from "@/components/tools/GbpTool";
import { KeywordBriefTool } from "@/components/tools/KeywordBriefTool";
import { ContentAuditorTool } from "@/components/tools/ContentAuditorTool";
import { CalendarTool } from "@/components/tools/CalendarTool";
import { RepurposerTool } from "@/components/tools/RepurposerTool";
import { ReplyAssistantTool } from "@/components/tools/ReplyAssistantTool";
import { HooksTool } from "@/components/tools/HooksTool";
import { NewsletterTool } from "@/components/tools/NewsletterTool";
import { AdCopyTool } from "@/components/tools/AdCopyTool";
import { CarouselTool } from "@/components/tools/CarouselTool";
import { HashtagsTool } from "@/components/tools/HashtagsTool";
import { SpintaxTool } from "@/components/tools/SpintaxTool";
import { FollowUpTool } from "@/components/tools/FollowUpTool";
import { PersonalisationTool } from "@/components/tools/PersonalisationTool";
import { ReplyClassifierTool } from "@/components/tools/ReplyClassifierTool";
import { ArrowLeft, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ToolRunnerPage({
  params: paramsPromise, searchParams: searchParamsPromise,
}: {
  params: Promise<{ category: string; tool: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const tool = getTool(params.category, params.tool);
  if (!tool || !tool.ready) notFound();

  const admin = createAdminClient();
  const companyName = client?.name ?? "the company";

  // Reopen a past run: load its stored output (scoped to this client + tool).
  let initial: unknown = null;
  if (searchParams.run && UUID_RE.test(searchParams.run)) {
    const { data: run } = await admin
      .from("tool_runs")
      .select("tool, client_id, output")
      .eq("id", searchParams.run)
      .maybeSingle();
    const r = run as { tool: string; client_id: string; output: unknown } | null;
    if (r && r.tool === params.tool && (r.client_id === user.client_id || user.role === "super_admin")) {
      initial = r.output ?? null;
    }
  }

  // Pre-run nudge: grounded tools produce generic output when DNA is empty.
  const dnaMissing: string[] = [];
  if (tool.grounded) {
    const { data: dna } = await admin
      .from("company_dna")
      .select("location, services, brand_voice")
      .eq("client_id", user.client_id)
      .maybeSingle();
    const d = dna as { location: string | null; services: string | null; brand_voice: string | null } | null;
    if (!d?.services) dnaMissing.push("services");
    if (!d?.location) dnaMissing.push("location");
    if (!d?.brand_voice) dnaMissing.push("brand voice");
  }

  return (
    <div className="page-prose">
      <Link href={`/tools/${params.category}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to {getCategory(params.category)?.title ?? "all"} tools
      </Link>

      {dnaMissing.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 mb-5">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400">
            This tool uses the client&apos;s Company DNA for grounding, but their <span className="text-zinc-200">{dnaMissing.join(", ")}</span> {dnaMissing.length === 1 ? "is" : "are"} empty —
            output will be more generic. <Link href="/company-dna" className="text-blue-400 hover:text-blue-300">Fill it in</Link> for client-specific results.
          </p>
        </div>
      )}

      {params.tool === "meta" && <MetaTool clientId={user.client_id} initial={initial} />}
      {params.tool === "gbp" && <GbpTool clientId={user.client_id} companyName={companyName} initial={initial} />}
      {params.tool === "keyword-brief" && <KeywordBriefTool clientId={user.client_id} initial={initial} />}
      {params.tool === "content-auditor" && <ContentAuditorTool clientId={user.client_id} initial={initial} />}
      {params.tool === "calendar" && <CalendarTool clientId={user.client_id} initial={initial} />}
      {params.tool === "repurposer" && <RepurposerTool clientId={user.client_id} initial={initial} />}
      {params.tool === "reply-assistant" && <ReplyAssistantTool clientId={user.client_id} initial={initial} />}
      {params.tool === "hooks" && <HooksTool clientId={user.client_id} initial={initial} />}
      {params.tool === "newsletter" && <NewsletterTool clientId={user.client_id} initial={initial} />}
      {params.tool === "ad-copy" && <AdCopyTool clientId={user.client_id} initial={initial} />}
      {params.tool === "carousel" && <CarouselTool clientId={user.client_id} initial={initial} />}
      {params.tool === "hashtags" && <HashtagsTool clientId={user.client_id} initial={initial} />}
      {params.tool === "spintax" && <SpintaxTool clientId={user.client_id} initial={initial} />}
      {params.tool === "follow-up" && <FollowUpTool clientId={user.client_id} initial={initial} />}
      {params.tool === "personalisation" && <PersonalisationTool clientId={user.client_id} initial={initial} />}
      {params.tool === "reply-classifier" && <ReplyClassifierTool clientId={user.client_id} initial={initial} />}
    </div>
  );
}
