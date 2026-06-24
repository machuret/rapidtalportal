import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersTable } from "@/components/admin/UsersTable";
import type { UserRole } from "@/types/database";

export const dynamic = "force-dynamic";

// Defensive cap (auth listUsers is already paged at 1000); far beyond real size.
const LIST_CAP = 2000;

export default async function AdminUsersPage() {
  const ctx = await requireSuperAdmin();

  const admin = createAdminClient();
  const [{ data: users }, { data: clients }, authList] = await Promise.all([
    admin
      .from("users")
      .select("id, email, full_name, role, client_id, created_at")
      .order("created_at", { ascending: false })
      .limit(LIST_CAP),
    admin.from("clients").select("id, name").order("name").limit(LIST_CAP),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  // Auth metadata: last sign-in and ban (= suspended) status per user.
  const lastActive: Record<string, string | null> = {};
  const suspended: Record<string, boolean> = {};
  for (const au of authList.data?.users ?? []) {
    lastActive[au.id] = au.last_sign_in_at ?? null;
    const bannedUntil = (au as { banned_until?: string }).banned_until;
    suspended[au.id] = !!bannedUntil && new Date(bannedUntil) > new Date();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">All Users</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Manage every user across all clients. Edit inline, change roles, or
        allocate to clients.
      </p>
      <UsersTable
        users={
          (users ?? []) as {
            id: string;
            email: string;
            full_name: string | null;
            role: UserRole;
            client_id: string | null;
            created_at: string;
          }[]
        }
        clients={(clients ?? []) as { id: string; name: string }[]}
        currentUserId={ctx.user.id}
        lastActive={lastActive}
        suspendedInit={suspended}
      />
    </div>
  );
}
