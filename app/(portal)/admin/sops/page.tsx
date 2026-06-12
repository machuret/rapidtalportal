import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopsLibrary } from "@/components/sops/SopsLibrary";
import type { Sop } from "@/app/(portal)/sops/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "SOP Library — RapidTal" };

export default async function AdminSopsPage() {
  const ctx = await requireSuperAdmin();

  const admin = createAdminClient();
  const { data: sops } = await admin
    .from("sops")
    .select("*")
    .is("client_id", null)
    .order("category")
    .order("order_index");

  const sopList = (sops ?? []) as Sop[];

  // Adoption stats: how often each library SOP has been run / completed / by how many VAs.
  const usage: Record<string, { runs: number; completions: number; users: number }> = {};
  if (sopList.length) {
    const { data: runs } = await admin
      .from("sop_runs")
      .select("sop_id, status, user_id")
      .in("sop_id", sopList.map((s) => s.id));
    const tmp: Record<string, { runs: number; completions: number; users: Set<string> }> = {};
    for (const r of (runs ?? []) as { sop_id: string; status: string; user_id: string | null }[]) {
      const e = (tmp[r.sop_id] ??= { runs: 0, completions: 0, users: new Set() });
      e.runs++;
      if (r.status === "completed") e.completions++;
      if (r.user_id) e.users.add(r.user_id);
    }
    for (const [k, v] of Object.entries(tmp)) usage[k] = { runs: v.runs, completions: v.completions, users: v.users.size };
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">SOP Library</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Generic, reusable SOPs (WordPress, Shopify, AI, email…) shared with <span className="text-zinc-300">every VA across all clients</span>.
        Build great step-by-step checklists here — they enrich every VA&apos;s everyday work.
      </p>
      <SopsLibrary
        sops={sopList}
        clientId=""
        userId={ctx.user.id}
        canEdit
        newHref="/sops/new?scope=global"
        usage={usage}
      />
    </div>
  );
}
