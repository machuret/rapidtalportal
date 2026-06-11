import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientsTable } from "@/components/admin/ClientsTable";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  // Get user counts per client
  const { data: userCounts } = await admin
    .from("users")
    .select("client_id");

  const countMap: Record<string, number> = {};
  for (const u of userCounts ?? []) {
    const row = u as { client_id: string | null };
    if (row.client_id) countMap[row.client_id] = (countMap[row.client_id] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Clients</h1>
      <p className="text-zinc-400 text-sm mb-8">All tenants on the Rapid Tile Portal.</p>
      <ClientsTable
        clients={(clients ?? []) as { id: string; name: string; slug: string; created_at: string; archived_at: string | null }[]}
        userCounts={countMap}
      />
    </div>
  );
}
