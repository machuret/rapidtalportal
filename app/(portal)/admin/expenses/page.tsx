import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExpensesClient, type Expense } from "@/components/admin/expenses/ExpensesClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Wallet } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses — RapidTal Admin" };

export default async function AdminExpensesPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { data } = await admin.from("expenses")
    .select("id, name, vendor, category, amount, currency, cadence, status, next_due_date, url, started_on, owner_id, notes, created_at, updated_at")
    .is("archived_at", null).order("status").order("name");

  return (
    <div>
      <AdminPageHeader icon={Wallet} gradient="from-emerald-500 to-green-600 shadow-emerald-500/20"
        title="Expenses" subtitle="Subscriptions, websites and costs — recurring or one-off, any currency. Internal to RapidTal." />
      <ExpensesClient initial={(data ?? []) as Expense[]} />
    </div>
  );
}
