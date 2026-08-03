import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { VaultClient } from "@/components/vault/VaultClient";
import { VaultTabs } from "@/components/vault/VaultTabs";
import { PageIntro } from "@/components/layout/PageIntro";
import { createAdminClient } from "@/lib/supabase/admin";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";
import { OnboardingStepReporter } from "@/components/onboarding/OnboardingStepReporter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vault — RapidTal" };

export default async function VaultPage({
  searchParams,
}: {
  searchParams?: Promise<{ setup?: string; open?: string; q?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");
  const clientId = user.client_id;

  const canWrite = user.role === "client_admin" || user.role === "super_admin" || user.role === "va";
  const onboardingMode = params?.setup === "documents" && user.role === "client_admin";
  const admin = createAdminClient();
  const dnaResult = await withPortalDataTimeout(
    (signal) => admin.from("company_dna").select("website").eq("client_id", clientId).abortSignal(signal).maybeSingle(),
    "Vault company website",
    5_000,
  ).catch(() => ({ data: null, error: null }));
  const dna = dnaResult.data;

  let companyWebsite: string | null = null;
  const rawWebsite = dna?.website?.trim();
  if (rawWebsite) {
    try {
      const parsed = new URL(/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`);
      parsed.protocol = "https:";
      companyWebsite = parsed.toString();
    } catch {
      // Invalid legacy DNA values remain editable in Company DNA, but are not
      // offered as a one-click crawl target.
    }
  }

  return (
    <div>
      {!onboardingMode && <VaultTabs active="documents" />}
      {!onboardingMode && <PageIntro id="vault" />}
      <VaultClient
        clientId={clientId}
        userId={user.id}
        role={user.role}
        canWrite={canWrite}
        companyWebsite={companyWebsite}
        focusMode={onboardingMode ? "documents" : null}
        initialSearch={typeof params?.q === "string" ? params.q.slice(0, 120) : ""}
        initialOpenItemId={typeof params?.open === "string" && /^[0-9a-f-]{36}$/iu.test(params.open) ? params.open : null}
      />
      {onboardingMode && <OnboardingStepReporter clientId={clientId} step="documents" />}
    </div>
  );
}
