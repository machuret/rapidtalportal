import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AskVaultClient } from "@/components/vault/AskVaultClient";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask as Client — RapidTal" };

// Admin-only spot-check: ask any client's Business Brain exactly what their
// team would ask, and see what it actually answers. The ask routes already
// authorize super_admin on any client via assertClientAccess.
export default async function AdminAskPage({ searchParams }: { searchParams: { client?: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = await admin.from("clients").select("id, name").order("name");
  const clients = (data ?? []) as { id: string; name: string }[];

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0]?.id ?? null;
  const clientName = clients.find((c) => c.id === clientId)?.name ?? "this client";

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Ask as Client</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Spot-check any client&apos;s Business Brain — ask what their team would ask and see the live answer.
          </p>
        </div>
      </div>

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
            <AskVaultClient
              key={clientId}
              clientId={clientId}
              companyName={clientName}
              canCurate
            />
          )}
        </>
      )}
    </div>
  );
}
