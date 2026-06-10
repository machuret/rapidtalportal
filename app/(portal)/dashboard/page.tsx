import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VaDashboard } from "@/components/dashboard/VaDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — RapidTal" };

export default async function DashboardPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;

  if (user.role === "super_admin") redirect("/admin");

  const supabase = createAdminClient();
  const clientId = user.client_id!;

  const [
    kbResult,
    recentResult,
    statusResult,
    vaultResult,
    sopsResult,
  ] = await Promise.all([
    supabase.from("kb_entries").select("id, question, answer").eq("client_id", clientId).order("generated_at", { ascending: false }).limit(50),
    supabase.from("crm_contacts").select("id, first_name, last_name, company, status, updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(8),
    supabase.rpc("get_contact_status_counts", { p_client_id: clientId }),
    supabase.from("vault_items").select("*", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "ready"),
    supabase.from("sops").select("*", { count: "exact", head: true }).eq("client_id", clientId),
  ]);

  if (kbResult.error)     console.error("[dashboard] kb_entries:", kbResult.error.message);
  if (recentResult.error) console.error("[dashboard] crm_contacts recent:", recentResult.error.message);
  if (statusResult.error) console.error("[dashboard] status_counts:", statusResult.error.message);
  if (vaultResult.error)  console.error("[dashboard] vault_items:", vaultResult.error.message);
  if (sopsResult.error)   console.error("[dashboard] sops:", sopsResult.error.message);

  const statusCounts = (statusResult.data ?? []) as { status: string; count: number }[];

  return (
    <VaDashboard
      userName={user.full_name ?? user.email}
      userId={user.id}
      clientName={client?.name ?? ""}
      kbEntries={(kbResult.data ?? []) as { id: string; question: string; answer: string }[]}
      recentContacts={(recentResult.data ?? []) as { id: string; first_name: string; last_name: string | null; company: string | null; status: string; updated_at: string }[]}
      statusCounts={statusCounts}
      vaultCount={vaultResult.count ?? 0}
      sopCount={sopsResult.count ?? 0}
    />
  );
}
