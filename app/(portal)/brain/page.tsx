import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeBrainScore } from "@/lib/brain/score";
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

  const score = await computeBrainScore(admin, clientId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;
  const [eventsRes, historyRes, decidedRes] = await Promise.all([
    a.from("brain_events").select("id, kind, summary, meta, created_at")
      .eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    a.from("brain_score_history").select("score, captured_date")
      .eq("client_id", clientId).order("captured_date", { ascending: true }).limit(60),
    a.from("content_topics").select("status, updated_at")
      .eq("client_id", clientId).in("status", ["approved", "rejected"]).order("updated_at", { ascending: true }).limit(1000),
  ]);

  const events = (eventsRes.data ?? []) as BrainEventRow[];
  const trend = ((historyRes.data ?? []) as { score: number }[]).map((r) => ({ score: r.score }));

  // Lift: acceptance over the first vs the most recent decided topics.
  const decided = (decidedRes.data ?? []) as { status: string }[];
  const acc = (rows: { status: string }[]) =>
    rows.length ? Math.round((rows.filter((r) => r.status === "approved").length / rows.length) * 100) : 0;
  let lift: { baseline: number; recent: number; delta: number } | null = null;
  if (decided.length >= 8) {
    const n = Math.min(10, Math.floor(decided.length / 2));
    const baseline = acc(decided.slice(0, n));
    const recent = acc(decided.slice(-n));
    lift = { baseline, recent, delta: recent - baseline };
  }

  return (
    <>
      <BrainHome clientName={client?.name ?? "your business"} score={score} events={events} trend={trend} lift={lift} />
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
