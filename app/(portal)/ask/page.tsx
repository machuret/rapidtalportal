import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { AskVaultClient } from "@/components/vault/AskVaultClient";
import { PageIntro } from "@/components/layout/PageIntro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask the Brain — RapidTal" };

export default async function AskPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canCurate = user.role === "client_admin" || user.role === "super_admin";

  return (
    <div className="page-prose">
      <PageIntro id="ask" />
      <AskVaultClient
        clientId={user.client_id}
        companyName={client?.name ?? "your company"}
        canCurate={canCurate}
      />
    </div>
  );
}
