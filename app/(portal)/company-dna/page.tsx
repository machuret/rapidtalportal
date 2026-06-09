import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DnaForm } from "@/components/dna/DnaForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company DNA — RapidTal" };

export default async function CompanyDnaPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/admin/clients");

  const admin = createAdminClient();
  const { data: dna } = await admin
    .from("company_dna")
    .select("*")
    .eq("client_id", user.client_id)
    .maybeSingle();

  // Any member of the client (client_admin or va) can edit Company DNA.
  const canEdit =
    user.role === "client_admin" || user.role === "super_admin" || user.role === "va";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Company DNA</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Core information about {client?.name ?? "your client"} — used by the AI to generate knowledge base answers.
      </p>
      <DnaForm initialData={dna ?? null} clientId={user.client_id} readOnly={!canEdit} />
    </div>
  );
}
