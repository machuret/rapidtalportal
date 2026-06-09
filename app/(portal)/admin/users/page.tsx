import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersTable } from "@/components/admin/UsersTable";
import type { UserRole } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: users }, { data: clients }] = await Promise.all([
    admin
      .from("users")
      .select("id, email, full_name, role, client_id, created_at")
      .order("created_at", { ascending: false }),
    admin.from("clients").select("id, name").order("name"),
  ]);

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
      />
    </div>
  );
}
