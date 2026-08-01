import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { StyleAnalysisManager } from "@/components/content/StyleAnalysisManager";
import { VoiceGoldenLibrary } from "@/components/content/VoiceGoldenLibrary";
import { LinkedInVaultSourcePanel } from "@/components/vault/LinkedInVaultSourcePanel";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content Style — RapidTal" };

export default async function ContentStyleRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canEdit = hasContentCapability(user.role, "edit_company_dna");
  const admin = createAdminClient();
  const { data: dna } = await admin
    .from("company_dna")
    .select("social_links")
    .eq("client_id", user.client_id)
    .maybeSingle();
  const socialLinks = (dna as { social_links?: Record<string, string> } | null)?.social_links;
  const linkedInUrl = typeof socialLinks?.linkedin === "string" ? socialLinks.linkedin : "";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content Style</h1>
      <p className="text-zinc-400 text-sm mb-8">
        How the engine learns to write like {client?.name ?? "your company"} — style analysis, golden examples and the sources that feed them.
        {!canEdit && " Read-only: ask your admin to make changes."}
      </p>
      <PageIntro id="content-style" />
      {canEdit && (
        <LinkedInVaultSourcePanel
          clientId={user.client_id}
          clientName={client?.name ?? "this company"}
          initialUrl={linkedInUrl}
        />
      )}
      <StyleAnalysisManager
        clientId={user.client_id}
        clientName={client?.name}
        canEdit={canEdit}
      />
      <VoiceGoldenLibrary clientId={user.client_id} canEdit={canEdit} />
    </div>
  );
}
