import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuickDraftPage } from "@/components/content/QuickDraftPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadBrandStyle } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quick Draft — RapidTal" };

export default async function QuickDraftRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const brandStyle = await loadBrandStyle(admin, user.client_id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Quick Draft</h1>
      <p className="text-zinc-400 text-sm mb-8">
        From a topic to a grounded, on-voice draft in under a minute.
      </p>
      <PageIntro id="content-quick" />
      <QuickDraftPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        brandStyle={brandStyle}
      />
    </div>
  );
}
