import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { AskVaultClient } from "@/components/vault/AskVaultClient";
import { PageIntro } from "@/components/layout/PageIntro";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "RapidTal Coach" };

export default async function AskPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canCurate = user.role === "client_admin" || user.role === "super_admin";
  const coachRole = user.role === "va" ? "va" : "client";
  const admin = createAdminClient();
  const { data: vaRows } = coachRole === "client"
    ? await admin
      .from("users")
      .select("id,full_name,email")
      .eq("client_id", user.client_id)
      .eq("role", "va")
      .order("full_name", { ascending: true })
    : { data: [] };
  const teamMembers = (vaRows ?? []).map((member) => ({
    id: member.id,
    name: member.full_name || member.email,
  }));

  return (
    <div className="page-prose">
      <PageIntro id="ask" />
      <AskVaultClient
        clientId={user.client_id}
        companyName={client?.name ?? "your company"}
        canCurate={canCurate}
        coachRole={coachRole}
        speakerName={user.full_name || user.email}
        teamMembers={teamMembers}
      />
    </div>
  );
}
