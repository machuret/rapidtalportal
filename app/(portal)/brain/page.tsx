import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeBrainReadiness } from "@/lib/brain/readiness";
import { BrainHome, type BrainEventRow } from "@/components/brain/BrainHome";
import { KnowledgeCoverage } from "@/components/brain/KnowledgeCoverage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Brain — RapidTal" };

export default async function BrainPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!["client_admin", "super_admin"].includes(user.role)) redirect("/dashboard");
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const clientId = user.client_id;

  const readiness = await computeBrainReadiness(admin, clientId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;
  const eventsRes = await a.from("brain_events")
    .select("id, kind, summary, meta, created_at")
    .eq("client_id", clientId)
    .eq("meaningful", true)
    .order("created_at", { ascending: false })
    .limit(20);

  const events = (eventsRes.data ?? []) as BrainEventRow[];

  return (
    <>
      <BrainHome clientName={client?.name ?? "your business"} readiness={readiness} events={events} />
      {/* "What the Vault knows" — folded in from the retired Company Report nav
          entry so client admins have one Company Brain home, not three. */}
      <div className="mt-10 pt-8 border-t border-zinc-800">
        <h2 className="text-xl font-bold text-white tracking-tight mb-1">What your brain knows</h2>
        <p className="text-zinc-400 text-sm mb-6">Coverage, gaps and the documents behind every answer — the more you add, the more complete it gets.</p>
        <KnowledgeCoverage clientId={clientId} clientName={client?.name ?? ""} canCurate={user.role === "client_admin" || user.role === "super_admin"} />
      </div>
    </>
  );
}
