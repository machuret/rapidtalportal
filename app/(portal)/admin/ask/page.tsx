import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminAskClient } from "@/components/vault/AdminAskClient";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask as Client — RapidTal" };

// Admin-only spot-check: ask any client's Business Brain exactly what their
// team would ask, and see what it actually answers. The ask routes already
// authorize super_admin on any client via assertClientAccess.
export default async function AdminAskPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ client?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { data } = await admin.from("clients").select("id, name").is("archived_at", null).order("name");
  const clients = (data ?? []) as { id: string; name: string }[];

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0]?.id ?? null;
  const clientName = clients.find((c) => c.id === clientId)?.name ?? "this client";

  return (
    <div>
      <AdminPageHeader icon={Sparkles} gradient="from-violet-500 to-purple-600 shadow-violet-500/20"
        title="Ask as Client"
        subtitle="Spot-check any client's Business Brain — ask what their team would ask and see the live answer." />

      {clients.length === 0 ? (
        <div className="surface-card rounded-xl p-10 text-center text-zinc-400 text-sm">
          No clients yet. Create a client and feed its Vault first.
        </div>
      ) : (
        <>
          {/* Client picker */}
          <div className="flex flex-wrap gap-2 mb-8">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/admin/ask?client=${c.id}`}
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
            <AdminAskClient
              key={clientId}
              clientId={clientId}
              companyName={clientName}
            />
          )}
        </>
      )}
    </div>
  );
}
