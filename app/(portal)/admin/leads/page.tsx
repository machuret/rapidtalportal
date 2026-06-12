import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LeadsBoard, type Lead, type LeadOwner } from "@/components/admin/leads/LeadsBoard";
import { Handshake } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads — RapidTal Admin" };

export default async function AdminLeadsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

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
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
          <Handshake className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Leads</h1>
          <p className="text-zinc-400 text-sm mt-1">Your sales pipeline. Internal to RapidTal — clients and VAs never see this.</p>
        </div>
      </div>

      <LeadsBoard initialLeads={(leads ?? []) as Lead[]} owners={owners} currentUserId={ctx.user.id} />
    </div>
  );
}
