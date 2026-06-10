import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { ComposeClient } from "@/components/vault/ComposeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compose — RapidTal" };

export default async function ComposePage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  return <ComposeClient clientId={user.client_id} companyName={client?.name ?? "the company"} />;
}
