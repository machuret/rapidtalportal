import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { AskVaultClient } from "@/components/vault/AskVaultClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask the Vault — RapidTal" };

export default async function AskPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  return <AskVaultClient clientId={user.client_id} companyName={client?.name ?? "your company"} />;
}
