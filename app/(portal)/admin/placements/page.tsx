import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPlacements, type AdminPlacementRow } from "@/components/admin/AdminPlacements";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Handshake } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Placements — RapidTal Admin" };

// Defensive cap so these reads can't scan an unbounded table; clients/users also
// feed the create-form dropdowns, so they're capped (not id-scoped). Far beyond
// any real platform size today.
const LIST_CAP = 2000;

export default async function AdminPlacementsPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const [{ data: placementRows }, { data: clients }, { data: users }] = await Promise.all([
    admin.from("placements").select("id, client_id, va_user_id, client_user_id, status").order("created_at", { ascending: false }).limit(LIST_CAP),
    admin.from("clients").select("id, name").is("archived_at", null).order("name").limit(LIST_CAP),
    admin.from("users").select("id, full_name, email, role, client_id").limit(LIST_CAP),
  ]);

  const nameOf = (id: string) => {
    const u = (users ?? []).find((x) => x.id === id) as { full_name: string | null; email: string } | undefined;
    return u?.full_name ?? u?.email ?? "—";
  };
  const orgOf = (id: string) => (clients ?? []).find((c) => c.id === id)?.name ?? null;

  const placements = (placementRows ?? []) as { id: string; client_id: string; va_user_id: string; client_user_id: string; status: string }[];
  const ids = placements.map((p) => p.id);

  // Per-placement METADATA ONLY — page counts (no titles/content) + the last
  // activity event. Admins never read notebook_pages content. Fetched in TWO
  // aggregate queries (was 2 per placement = an N+1) and tallied in code.
  const [{ data: pageRows }, { data: activityRows }] = ids.length
    ? await Promise.all([
        admin.from("notebook_pages").select("placement_id").eq("is_archived", false).in("placement_id", ids),
        admin.from("notebook_activity").select("placement_id, actor_role, created_at").in("placement_id", ids).order("created_at", { ascending: false }).limit(10000),
      ])
    : [{ data: [] as { placement_id: string }[] }, { data: [] as { placement_id: string; actor_role: string; created_at: string }[] }];

  const pageCount = new Map<string, number>();
  for (const r of (pageRows ?? []) as { placement_id: string }[]) {
    pageCount.set(r.placement_id, (pageCount.get(r.placement_id) ?? 0) + 1);
  }
  const lastAct = new Map<string, { actor_role: string; created_at: string }>();
  for (const a of (activityRows ?? []) as { placement_id: string; actor_role: string; created_at: string }[]) {
    // Rows are newest-first, so the first seen per placement is the latest.
    if (!lastAct.has(a.placement_id)) lastAct.set(a.placement_id, { actor_role: a.actor_role, created_at: a.created_at });
  }

  const rows: AdminPlacementRow[] = placements.map((p) => {
    const last = lastAct.get(p.id);
    return {
      id: p.id,
      status: p.status,
      vaName: nameOf(p.va_user_id),
      clientPersonName: nameOf(p.client_user_id),
      orgName: orgOf(p.client_id),
      pageCount: pageCount.get(p.id) ?? 0,
      lastActivityAt: last?.created_at ?? null,
      lastActorRole: last?.actor_role ?? null,
    };
  });

  const vas = (users ?? []).filter((u) => u.role === "va" && u.client_id)
    .map((u) => ({ id: u.id, name: u.full_name ?? u.email, clientId: u.client_id as string }));
  const clientContacts = (users ?? []).filter((u) => u.role === "client_admin" && u.client_id)
    .map((u) => ({ id: u.id, name: u.full_name ?? u.email, clientId: u.client_id as string }));

  return (
    <div>
      <AdminPageHeader icon={Handshake} gradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
        title="Placements" subtitle="VA–client engagements and their Notebook activity. Content is private to participants." />
      <AdminPlacements placements={rows} clients={(clients ?? []) as { id: string; name: string }[]} vas={vas} clientContacts={clientContacts} />
    </div>
  );
}
