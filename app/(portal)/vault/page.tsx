import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { VaultClient } from "@/components/vault/VaultClient";
import { PageIntro } from "@/components/layout/PageIntro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vault — RapidTal" };

export default async function VaultPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canWrite = user.role === "client_admin" || user.role === "super_admin" || user.role === "va";

  return (
    <div className="max-w-5xl">
      <PageIntro id="vault" />
      <VaultClient
        clientId={user.client_id}
        userId={user.id}
        role={user.role}
        canWrite={canWrite}
      />
    </div>
  );
}
