import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { VaultClient } from "@/components/vault/VaultClient";
import { VaultTabs } from "@/components/vault/VaultTabs";
import { PageIntro } from "@/components/layout/PageIntro";
import { createAdminClient } from "@/lib/supabase/admin";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vault — RapidTal" };

export default async function VaultPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");
  const clientId = user.client_id;

  const canWrite = user.role === "client_admin" || user.role === "super_admin" || user.role === "va";
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
      <VaultTabs active="documents" />
      <PageIntro id="vault" />
      <VaultClient
        clientId={clientId}
        userId={user.id}
        role={user.role}
        canWrite={canWrite}
        companyWebsite={companyWebsite}
      />
    </div>
  );
}
