import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopsLibrary } from "@/components/sops/SopsLibrary";
import { SopSuggestions, type SopSuggestion } from "@/components/sops/SopSuggestions";
import { SopCategoryManager, type CatCount } from "@/components/sops/SopCategoryManager";
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

  // Open SOP-idea backlog (global scope).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: suggestionRows } = await (admin as any)
    .from("sop_suggestions")
    .select("id, title, scope, category, step_count, status, created_at")
    .is("client_id", null)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const suggestions = (suggestionRows ?? []) as SopSuggestion[];

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

  // All VAs (across clients) — bulk "restrict to VAs" picker for global SOPs.
  const { data: vaRows } = await admin.from("users").select("id, full_name, email").eq("role", "va").order("full_name");
  const vaOptions = ((vaRows ?? []) as { id: string; full_name: string | null; email: string }[]).map((v) => ({ id: v.id, name: v.full_name || v.email }));

  // Category / subcategory counts for the manager — derived from SOPs, then
  // unioned with managed entries (so a just-created, still-empty one shows too).
  const catCounts = new Map<string, number>();
  const subCounts = new Map<string, number>();
  for (const s of sopList) {
    const c = (s.category || "General").trim();
    catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    const sub = (s.subcategory ?? "").trim();
    if (sub) subCounts.set(sub, (subCounts.get(sub) ?? 0) + 1);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: managed } = await (admin as any).from("sop_categories").select("kind, name").is("client_id", null);
  for (const m of (managed ?? []) as { kind: string; name: string }[]) {
    const map = m.kind === "subcategory" ? subCounts : catCounts;
    if (!map.has(m.name)) map.set(m.name, 0);
  }
  const toSorted = (m: Map<string, number>): CatCount[] => Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">SOP Library</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Generic, reusable SOPs (WordPress, Shopify, AI, email…) shared with <span className="text-zinc-300">every VA across all clients</span>.
        Build great step-by-step checklists here — they enrich every VA&apos;s everyday work.
      </p>
      <SopSuggestions clientId={null} initial={suggestions} />
      <SopCategoryManager clientId={null} categories={toSorted(catCounts)} subcategories={toSorted(subCounts)} />
      <SopsLibrary
        sops={sopList}
        clientId=""
        userId={ctx.user.id}
        canEdit
        newHref="/sops/new?scope=global"
        usage={usage}
        bulk={{ clientId: null, vaOptions }}
      />
    </div>
  );
}
