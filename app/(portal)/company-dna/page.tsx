import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DnaForm } from "@/components/dna/DnaForm";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

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

  // Admin-only editing: DNA feeds every AI answer, so a stray VA edit would
  // silently poison the Brain. VAs read it; admins own it.
  const canEdit = hasContentCapability(user.role, "edit_company_dna");

  return (
    <div className="page-prose">
      <h1 className="text-2xl font-bold mb-1">Company DNA</h1>
      <p className="text-zinc-400 text-sm mb-8">
        The core profile of {client?.name ?? "your client"} — goals, audience, tools, voice and rules.
        The AI reads this in every answer, topic and draft it produces, so the more you fill in, the smarter and more on-brand everything becomes.
        {!canEdit && " Read-only: ask your admin to update anything that's wrong."}
      </p>
      <PageIntro id="company-dna" />
      <DnaForm initialData={dna ?? null} clientId={user.client_id} readOnly={!canEdit} />
    </div>
  );
}
