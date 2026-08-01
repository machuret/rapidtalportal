import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IdeasPage } from "@/components/content/IdeasPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadBrandStyle, loadProjects, loadTopics, loadVaultGaps } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ideas — RapidTal" };

export default async function IdeasRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const [brandStyle, topics, { projects, hasMore }, vaultGaps] = await Promise.all([
    loadBrandStyle(admin, user.client_id),
    loadTopics(admin, user.client_id),
    loadProjects(admin, user.client_id),
    loadVaultGaps(admin, user.client_id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Ideas</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Grounded ideas from your DNA, Vault and the gaps your team actually asks about.
      </p>
      <PageIntro id="content-ideas" />
      <IdeasPage
        clientId={user.client_id}
        viewerUserId={user.id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        brandStyle={brandStyle}
        initialTopics={topics}
        initialProjects={projects}
        projectsHasMore={hasMore}
        vaultGaps={vaultGaps}
      />
    </div>
  );
}
