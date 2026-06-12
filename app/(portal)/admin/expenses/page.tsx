import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExpensesClient, type Expense } from "@/components/admin/expenses/ExpensesClient";
import { Wallet } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses — RapidTal Admin" };

export default async function AdminExpensesPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = await admin.from("expenses")
    .select("id, name, vendor, category, amount, currency, cadence, status, next_due_date, url, started_on, owner_id, notes, created_at, updated_at")
    .is("archived_at", null).order("status").order("name");

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Wallet className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Expenses</h1>
          <p className="text-zinc-400 text-sm mt-1">Subscriptions, websites and costs — recurring or one-off, any currency. Internal to RapidTal.</p>
        </div>
      </div>
      <ExpensesClient initial={(data ?? []) as Expense[]} />
    </div>
  );
}
