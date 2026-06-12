import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VaultClient } from "@/components/vault/VaultClient";
import { cn } from "@/lib/utils";
import { Archive } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client Vaults — RapidTal" };

// Admin-only view for feeding any client's Vault (Business Brain). The vault
// write/read routes already authorize super_admin on any client via
// assertClientAccess, so this simply points the existing VaultClient at a
// chosen client_id.
export default async function AdminVaultPage({ searchParams }: { searchParams: { client?: string } }) {
  const { user } = await requireSuperAdmin();

  const admin = createAdminClient();
  const { data } = await admin.from("clients").select("id, name").is("archived_at", null).order("name");
  const clients = (data ?? []) as { id: string; name: string }[];

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0]?.id ?? null;
  const clientName = clients.find((c) => c.id === clientId)?.name;

  if (clients.length === 0) {
    return (
      <div>
        <AdminPageHeader icon={Archive} gradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
          title="Client Vaults" subtitle="Feed any client's Business Brain." />
        <div className="surface-card rounded-xl p-10 text-center text-zinc-400 text-sm">
          No clients yet. Create a client first, then feed its Vault here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader icon={Archive} gradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
        title="Client Vaults" subtitle="Add documents, URLs, and notes to any client's Business Brain." />

      {/* Client picker */}
      <div className="flex flex-wrap gap-2 mb-8">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/admin/vault?client=${c.id}`}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              c.id === clientId
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600",
            )}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {clientId && (
        <VaultClient
          key={clientId}
          clientId={clientId}
          userId={user.id}
          role="super_admin"
          canWrite
          title={`${clientName} — Vault`}
          subtitle="Everything you add here feeds this client's Business Brain and AI answers."
        />
      )}
    </div>
  );
}
