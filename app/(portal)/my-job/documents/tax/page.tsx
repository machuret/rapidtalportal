import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentShell } from "@/components/my-job/DocumentShell";
import { periodEarnings, weekdaysInMonth, fmtMoney, type PayContract, type WorkedDay } from "@/lib/my-job/pay";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yearly Income Summary — RapidTal" };

/**
 * Tax record archive — yearly income summary compiled from logged days and the
 * contract rate, month by month, for the VA's BIR filing. Same pay math as the
 * invoice generator (lib/my-job/pay.ts) so the documents always agree.
 */
export default async function TaxSummaryPage({ searchParams }: { searchParams: { year?: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!["va", "client_admin"].includes(user.role)) redirect("/dashboard");

  const year = /^\d{4}$/.test(searchParams.year ?? "") ? Number(searchParams.year) : new Date().getFullYear();

  const admin = createAdminClient();
  const [{ data: contractRow }, { data: dayRows }] = await Promise.all([
    admin.from("va_job_contracts").select("rate, currency, pay_period").eq("user_id", user.id).maybeSingle(),
    admin.from("va_days_worked").select("work_date, hours").eq("user_id", user.id).gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`).order("work_date"),
  ]);
  const contract = contractRow as PayContract | null;
  const days = (dayRows ?? []) as WorkedDay[];
  const ccy = contract?.currency ?? "USD";

  // Month-by-month breakdown using the shared pay math.
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const monthDays = days.filter((d) => d.work_date.startsWith(key));
    const earn = periodEarnings(contract, monthDays, 1, weekdaysInMonth(year, i + 1));
    return { key, label: new Date(year, i, 1).toLocaleDateString("en", { month: "long" }), ...earn };
  });
  const total = months.reduce((s, m) => s + (m.amount ?? 0), 0);
  const totalDays = months.reduce((s, m) => s + m.days, 0);
  const totalHours = months.reduce((s, m) => s + m.hours, 0);
  const today = formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" });

  return (
    <DocumentShell>
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Yearly Income Summary</h1>
          <p className="text-sm text-zinc-500 mt-1">Calendar year {year} · for tax filing (e.g. BIR)</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{user.full_name ?? user.email}</p>
          {client?.name && <p className="text-zinc-600">Engaged via RapidTal for {client.name}</p>}
        </div>
      </div>

      <table className="w-full text-sm mb-8">
        <thead>
          <tr className="border-b-2 border-zinc-900 text-left">
            <th className="py-2 font-semibold">Month</th>
            <th className="py-2 font-semibold text-right">Days</th>
            <th className="py-2 font-semibold text-right">Hours</th>
            <th className="py-2 font-semibold text-right">Basis</th>
            <th className="py-2 font-semibold text-right">Income</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.key} className={m.days === 0 ? "border-b border-zinc-100 text-zinc-400" : "border-b border-zinc-200"}>
              <td className="py-2">{m.label}</td>
              <td className="py-2 text-right tabular-nums">{m.days || "—"}</td>
              <td className="py-2 text-right tabular-nums">{m.hours || "—"}</td>
              <td className="py-2 text-right text-zinc-500 text-xs">{m.days > 0 ? m.basis : ""}</td>
              <td className="py-2 text-right tabular-nums font-medium">{m.amount != null ? fmtMoney(m.amount, ccy) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-3 font-semibold">Total {year}</td>
            <td className="py-3 text-right font-semibold tabular-nums">{totalDays}</td>
            <td className="py-3 text-right font-semibold tabular-nums">{totalHours || "—"}</td>
            <td />
            <td className="py-3 text-right text-lg font-bold tabular-nums">{fmtMoney(total, ccy)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="text-3xs text-zinc-400 mt-10">
        Compiled by RapidTal Portal on {today} from the working days logged in the portal and the contract rate on file.
        Months with no logged days show no income. This summary is an aid for the contractor&apos;s own tax filing and is not formal tax advice.
      </p>
    </DocumentShell>
  );
}
