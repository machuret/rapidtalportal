import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentShell } from "@/components/my-job/DocumentShell";
import { periodEarnings, fmtMoney, type PayContract, type WorkedDay } from "@/lib/my-job/pay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice — RapidTal" };

/**
 * Invoice generator — auto-built from the VA's logged days + contract rate
 * for a month. Document tool only (print / save as PDF); no payment processing.
 * The days-worked monthly summary is attached below the invoice body.
 */
export default async function InvoicePage({ searchParams }: { searchParams: { month?: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!["va", "client_admin"].includes(user.role)) redirect("/dashboard");

  // Default to the previous month — the one you'd normally be invoicing.
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  const monthEndDate = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
  const monthEnd = `${month}-${String(monthEndDate.getDate()).padStart(2, "0")}`;
  const monthLabel = monthEndDate.toLocaleDateString("en", { month: "long", year: "numeric" });

  const admin = createAdminClient();
  const [{ data: contractRow }, { data: dayRows }, { data: profile }] = await Promise.all([
    admin.from("va_job_contracts").select("rate, currency, pay_period, payment_method, payment_schedule").eq("user_id", user.id).maybeSingle(),
    admin.from("va_days_worked").select("work_date, hours, note").eq("user_id", user.id).gte("work_date", monthStart).lte("work_date", monthEnd).order("work_date"),
    admin.from("users").select("address, personal_email, payment_details").eq("id", user.id).maybeSingle(),
  ]);
  const contract = contractRow as (PayContract & { payment_method: string | null; payment_schedule: string | null }) | null;
  const days = (dayRows ?? []) as (WorkedDay & { note: string | null })[];
  const p = profile as { address: string | null; personal_email: string | null; payment_details: string | null } | null;

  const earn = periodEarnings(contract, days, 1);
  const ccy = contract?.currency ?? "USD";
  const invoiceNo = `INV-${month.replace("-", "")}-${user.id.slice(0, 4).toUpperCase()}`;

  return (
    <DocumentShell>
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
          <p className="text-sm text-zinc-500 mt-1">{invoiceNo}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{user.full_name ?? user.email}</p>
          {p?.address && <p className="text-zinc-600 whitespace-pre-line">{p.address}</p>}
          <p className="text-zinc-600">{p?.personal_email || user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-10 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">Bill to</p>
          <p className="font-semibold">{client?.name ?? "Client"}</p>
        </div>
        <div className="text-right">
          <p><span className="text-zinc-500">Invoice date:</span> {new Date().toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}</p>
          <p><span className="text-zinc-500">Period:</span> {monthLabel}</p>
        </div>
      </div>

      {/* Line items */}
      <table className="w-full text-sm mb-8">
        <thead>
          <tr className="border-b-2 border-zinc-900 text-left">
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 font-semibold text-right">Basis</th>
            <th className="py-2 font-semibold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-200">
            <td className="py-3">Virtual assistant services — {monthLabel}</td>
            <td className="py-3 text-right text-zinc-600">{earn.basis}</td>
            <td className="py-3 text-right font-medium">{earn.amount != null ? fmtMoney(earn.amount, ccy) : "—"}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="py-3 text-right font-semibold">Total due</td>
            <td className="py-3 text-right text-lg font-bold">{earn.amount != null ? fmtMoney(earn.amount, ccy) : "—"}</td>
          </tr>
        </tfoot>
      </table>

      {/* Payment details */}
      {(p?.payment_details || contract?.payment_method) && (
        <div className="mb-10 text-sm">
          <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">Payment details</p>
          {contract?.payment_method && <p>Method: {contract.payment_method}{contract.payment_schedule ? ` · ${contract.payment_schedule}` : ""}</p>}
          {p?.payment_details && <p className="text-zinc-600 whitespace-pre-line">{p.payment_details}</p>}
        </div>
      )}

      {/* Monthly summary attachment */}
      <div className="pt-6 border-t border-zinc-200 break-inside-avoid">
        <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
          Attachment — days worked in {monthLabel} ({earn.days} days{earn.hours ? `, ${earn.hours} hrs` : ""})
        </p>
        {days.length === 0 ? (
          <p className="text-sm text-zinc-500">No days were logged for this month.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 font-medium">Hours</th>
                <th className="py-1 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.work_date} className="border-b border-zinc-100">
                  <td className="py-1 tabular-nums">{new Date(d.work_date + "T00:00:00").toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="py-1">{d.hours ?? "—"}</td>
                  <td className="py-1 text-zinc-600">{d.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-zinc-400 mt-10">
        Generated by RapidTal Portal from logged working days and contract rate. This is a billing document only — payment is arranged directly between the parties.
      </p>
    </DocumentShell>
  );
}
