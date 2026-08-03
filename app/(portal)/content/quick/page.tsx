import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuickDraftPage } from "@/components/content/QuickDraftPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadBrandStyle } from "@/lib/content/server";
import { OnboardingStepReporter } from "@/components/onboarding/OnboardingStepReporter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create content — RapidTal" };

export default async function QuickDraftRoute({
  searchParams,
}: {
  searchParams?: Promise<{ setup?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const brandStyle = await loadBrandStyle(admin, user.client_id);
  const onboardingMode = params?.setup === "first-draft" && user.role === "client_admin";

  return (
    <div>
      {!onboardingMode && (
        <>
          <PageIntro id="content-quick" />
        </>
      )}
      <QuickDraftPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        brandStyle={brandStyle}
        onboardingMode={onboardingMode}
      />
      {onboardingMode && <OnboardingStepReporter clientId={user.client_id} step="draft" />}
    </div>
  );
}
