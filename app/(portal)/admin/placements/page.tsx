import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPlacements, type AdminPlacementRow } from "@/components/admin/AdminPlacements";
import { Handshake } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Placements — RapidTal Admin" };

export default async function AdminPlacementsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: placementRows }, { data: clients }, { data: users }] = await Promise.all([
    admin.from("placements").select("id, client_id, va_user_id, client_user_id, status").order("created_at", { ascending: false }),
    admin.from("clients").select("id, name").is("archived_at", null).order("name"),
    admin.from("users").select("id, full_name, email, role, client_id"),
  ]);

  const nameOf = (id: string) => {
    const u = (users ?? []).find((x) => x.id === id) as { full_name: string | null; email: string } | undefined;
    return u?.full_name ?? u?.email ?? "—";
  };
  const orgOf = (id: string) => (clients ?? []).find((c) => c.id === id)?.name ?? null;

  const placements = (placementRows ?? []) as { id: string; client_id: string; va_user_id: string; client_user_id: string; status: string }[];

  // Per-placement METADATA ONLY — page counts (no titles/content) + the last
  // activity event. Admins never read notebook_pages content.
  const rows: AdminPlacementRow[] = await Promise.all(placements.map(async (p) => {
    const [{ count }, { data: act }] = await Promise.all([
      admin.from("notebook_pages").select("id", { count: "exact", head: true }).eq("placement_id", p.id).eq("is_archived", false),
      admin.from("notebook_activity").select("actor_role, created_at").eq("placement_id", p.id).order("created_at", { ascending: false }).limit(1),
    ]);
    const last = (act ?? [])[0] as { actor_role: string; created_at: string } | undefined;
    return {
      id: p.id,
      status: p.status,
      vaName: nameOf(p.va_user_id),
      clientPersonName: nameOf(p.client_user_id),
      orgName: orgOf(p.client_id),
      pageCount: count ?? 0,
      lastActivityAt: last?.created_at ?? null,
      lastActorRole: last?.actor_role ?? null,
    };
  }));

  const vas = (users ?? []).filter((u) => u.role === "va" && u.client_id)
    .map((u) => ({ id: u.id, name: u.full_name ?? u.email, clientId: u.client_id as string }));
  const clientContacts = (users ?? []).filter((u) => ["client_admin", "client"].includes(u.role) && u.client_id)
    .map((u) => ({ id: u.id, name: u.full_name ?? u.email, clientId: u.client_id as string }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Handshake className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Placements</h1>
          <p className="text-zinc-400 text-sm mt-1">VA–client engagements and their Notebook activity. Content is private to participants.</p>
        </div>
      </div>
      <AdminPlacements placements={rows} clients={(clients ?? []) as { id: string; name: string }[]} vas={vas} clientContacts={clientContacts} />
    </div>
  );
}
