import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeBrainReadiness } from "@/lib/brain/readiness";
import { BrainHome, type BrainEventRow } from "@/components/brain/BrainHome";
import { KnowledgeCoverage, KnowledgeCoverageSkeleton } from "@/components/brain/KnowledgeCoverage";
import { BrainOpportunities } from "@/components/brain/BrainOpportunities";
import {
  listBrainOpportunities,
  type BrainOpportunity,
} from "@/lib/brain/opportunities";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Brain — RapidTal" };

export default async function BrainPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!["client_admin", "super_admin", "va"].includes(user.role)) redirect("/dashboard");

  const admin = createAdminClient();
  let clientId = user.client_id;
  let clientName = client?.name ?? "your business";
  let clientOptions: { id: string; name: string }[] = [];

  // A super-admin normally has no client_id. Let them inspect any active
  // company Brain directly instead of silently redirecting /brain away.
  if (user.role === "super_admin") {
    const { data: clients, error: clientsError } = await admin
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name");

    if (clientsError) {
      throw new Error(`Company Brains could not be loaded: ${clientsError.message}`);
    }

    clientOptions = (clients ?? []) as { id: string; name: string }[];
    const selected = clientOptions.find((option) => option.id === searchParams.client)
      ?? clientOptions[0];
    clientId = selected?.id ?? null;
    clientName = selected?.name ?? "your business";
  }

  if (!clientId) {
    return (
      <div className="surface-card rounded-xl p-10 text-center">
        <h1 className="text-2xl font-bold text-white">No Company Brain yet</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Create an active client first, then its live Brain will appear here.
        </p>
        {user.role === "super_admin" && (
          <Link href="/admin/clients" className="mt-5 inline-flex text-sm font-medium text-orange-400 hover:text-orange-300">
            Go to clients
          </Link>
        )}
      </div>
    );
  }

  // Readiness, journal events and opportunities are independent — fetch them
  // in one parallel batch instead of three sequential round-trips. A failed
  // opportunities load degrades gracefully so the rest of the page renders.
  const opportunitiesPromise = listBrainOpportunities(admin, clientId)
    .then((rows) => ({ rows, failed: false }))
    .catch((error: unknown) => {
      console.error("[brain] proactive opportunities unavailable", error);
      return { rows: [] as BrainOpportunity[], failed: true };
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;
  const [readiness, eventsRes, opportunitiesResult] = await Promise.all([
    computeBrainReadiness(admin, clientId),
    a.from("brain_events")
      .select("id, kind, summary, meta, created_at")
      .eq("client_id", clientId)
      .eq("meaningful", true)
      .order("created_at", { ascending: false })
      .limit(20),
    opportunitiesPromise,
  ]);

  const events = (eventsRes.data ?? []) as BrainEventRow[];
  const opportunities = opportunitiesResult.rows;
  const opportunitiesLoadFailed = opportunitiesResult.failed;

  return (
    <>
      {clientOptions.length > 0 && (
        <div className="mb-6">
          <p className="label-section mb-2">Viewing company Brain</p>
          <div className="flex flex-wrap gap-2">
            {clientOptions.map((option) => (
              <Link
                key={option.id}
                href={`/brain?client=${option.id}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  option.id === clientId
                    ? "border-orange-500/50 bg-orange-500/15 text-orange-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white",
                )}
              >
                {option.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      <BrainHome clientName={clientName} readiness={readiness} events={events} />
      <BrainOpportunities
        clientId={clientId}
        canManage={user.role === "client_admin" || user.role === "super_admin"}
        initialOpportunities={opportunities}
        initialLoadFailed={opportunitiesLoadFailed}
      />
      {/* "What the Vault knows" — folded in from the retired Company Report nav
          entry so client admins have one Company Brain home, not three. */}
      <div className="mt-10 pt-8 border-t border-zinc-800">
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">What your brain knows</h2>
        <p className="text-zinc-400 text-sm mb-6">Coverage, gaps and the documents behind every answer — the more you add, the more complete it gets.</p>
        <Suspense fallback={<KnowledgeCoverageSkeleton />}>
          <KnowledgeCoverage clientId={clientId} clientName={clientName} canCurate={user.role === "client_admin" || user.role === "super_admin"} />
        </Suspense>
      </div>
    </>
  );
}
