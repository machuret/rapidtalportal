import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LeadsBoard, type Lead, type LeadOwner } from "@/components/admin/leads/LeadsBoard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads — RapidTal Admin" };

export default async function AdminLeadsPage() {
  const ctx = await requireSuperAdmin();

  const admin = createAdminClient();
  const [{ data: leads }, { data: admins }] = await Promise.all([
    admin.from("leads")
      .select("id, name, company, contact_name, email, phone, source, stage, value, owner_id, next_action, next_action_date, notes, sort_order, created_at, updated_at")
      .is("archived_at", null).order("sort_order").order("created_at", { ascending: false }),
    admin.from("users").select("id, full_name, email").eq("role", "super_admin").order("full_name"),
  ]);

  const owners: LeadOwner[] = ((admins ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((a) => ({ id: a.id, name: a.full_name ?? a.email }));

  return (
    <div>
      <AdminPageHeader icon={TrendingUp} gradient="from-pink-500 to-rose-600 shadow-pink-500/20"
        title="Leads" subtitle="Your sales pipeline. Internal to RapidTal — clients and VAs never see this." />

      <LeadsBoard initialLeads={(leads ?? []) as Lead[]} owners={owners} currentUserId={ctx.user.id} />
    </div>
  );
}
