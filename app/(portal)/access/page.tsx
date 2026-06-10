import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessClient, type AccessEntry } from "@/components/access/AccessClient";
import { cn } from "@/lib/utils";
import { KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access — RapidTal" };

// Passwords (even encrypted) never enter a page payload.
const SAFE_SELECT = "id, client_id, created_by, site, category, url, username, created_at, updated_at";

export default async function AccessPage({ searchParams }: { searchParams: { client?: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;

  const isSuperAdmin = user.role === "super_admin";
  const isAdmin = isSuperAdmin || user.role === "client_admin";

  const admin = createAdminClient();

  // Super admin picks which client's vault to manage; everyone else gets their own.
  let clients: { id: string; name: string }[] = [];
  let clientId = user.client_id;
  if (isSuperAdmin) {
    const { data } = await admin.from("clients").select("id, name").order("name");
    clients = (data ?? []) as { id: string; name: string }[];
    clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
      ? searchParams.client
      : clients[0]?.id ?? null;
  }
  if (!clientId) redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (admin as any)
    .from("access_credentials")
    .select(SAFE_SELECT)
    .eq("client_id", clientId)
    .order("category")
    .order("site");

  const clientName = isSuperAdmin
    ? clients.find((c) => c.id === clientId)?.name
    : client?.name;

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <KeyRound className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Access</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {isAdmin
              ? `Logins and passwords ${clientName ? `for ${clientName} ` : ""}— encrypted, shared securely with the team.`
              : "Logins your client has shared with you. Click the eye to reveal a password."}
          </p>
        </div>
      </div>

      {isSuperAdmin && clients.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/access?client=${c.id}`}
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
      )}

      <AccessClient
        key={clientId}
        initialItems={(items ?? []) as AccessEntry[]}
        clientId={clientId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
