import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { CompetitorsTab } from "@/components/content/CompetitorsTab";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Competitors — RapidTal" };

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
      <CompetitorsTab
        clientId={user.client_id}
        canManage={hasContentCapability(user.role, "manage_competitors")}
        active
        showIntelligence={false}
      />
    </div>
  );
}
