import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Radar, RefreshCw, BarChart3 } from "lucide-react";
import { getCurrentUserAndClient } from "@/lib/auth";
import { CompetitorsTab } from "@/components/content/competitors/CompetitorsTab";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Competitors — RapidTal" };

const NEXT_STEPS = [
  {
    icon: RefreshCw,
    title: "1. Collect their content",
    body: "After adding a competitor, refresh its sources below (website, blog, RSS, LinkedIn). The readiness score turns green at 5+ items and 2,500+ characters.",
  },
  {
    icon: BarChart3,
    title: "2. Run the analysis",
    body: "Once a competitor is green, the analysis maps their topics, formats and positioning — and compares them to your DNA.",
  },
  {
    icon: Radar,
    title: "3. Turn gaps into drafts",
    body: "Recommended ideas land in Content → Competitor Ideas, ready to start a grounded draft with one click.",
  },
];

export default async function DnaCompetitorsRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Competitors</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Who you compete with — their public content is collected here and kept strictly separate from your Company DNA.
      </p>
      <PageIntro id="dna-competitors" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {NEXT_STEPS.map((step) => (
          <div key={step.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <step.icon className="h-4 w-4 text-orange-400" />
            <p className="mt-2 text-sm font-semibold text-white">{step.title}</p>
            <p className="mt-1 text-xs text-zinc-500">{step.body}</p>
          </div>
        ))}
      </div>
      <div className="mb-8 rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 text-sm text-zinc-300">
        Added your competitors? The analysis itself lives in Content → Competitor Ideas.{" "}
        <Link href="/content/competitors" className="inline-flex items-center gap-1 font-semibold text-orange-400 hover:text-orange-300">
          Open Competitor Ideas <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <CompetitorsTab
        clientId={user.client_id}
        canManage={hasContentCapability(user.role, "manage_competitors")}
        active
        showIntelligence={false}
      />
    </div>
  );
}
