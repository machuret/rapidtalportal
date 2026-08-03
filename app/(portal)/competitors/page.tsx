import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CompetitorIdeasPage } from "@/components/content/CompetitorIdeasPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadBrandStyle } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Competitor insights — RapidTal" };

export default async function CompetitorWorkspaceRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const brandStyle = await loadBrandStyle(admin, user.client_id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Competitor insights</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Add competitors, collect public content, analyse the market and turn opportunities into drafts—all in one place.
      </p>
      <PageIntro id="content-competitors" />
      <CompetitorIdeasPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        canManage={hasContentCapability(user.role, "manage_competitors")}
        brandStyle={brandStyle}
      />
    </div>
  );
}
