import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvoiceBuilder, type InvoiceInitial } from "@/components/my-job/InvoiceBuilder";
import { periodEarnings, weekdaysInMonth, type PayContract, type WorkedDay } from "@/lib/my-job/pay";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice — RapidTal" };

/**
 * Invoice generator. The server pre-fills an invoice from the VA's logged days +
 * contract rate for a month; the client `InvoiceBuilder` then makes every field
 * editable so the VA can bill freely (fixed fees, projects, anything not tied to
 * hours). Document tool only (print / save as PDF); no payment processing.
 */
export default async function InvoicePage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await searchParamsPromise;
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

  // Monthly contracts prorate by the weekdays in this month (capped at full).
  const earn = periodEarnings(contract, days, 1, weekdaysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))));
  const ccy = contract?.currency ?? "USD";
  const invoiceNo = `INV-${month.replace("-", "")}-${user.id.slice(0, 4).toUpperCase()}`;

  // Build the editable "from" contact block and the payment-details note.
  const fromContact = [p?.address, p?.personal_email || user.email].filter(Boolean).join("\n");
  const paymentLine = contract?.payment_method
    ? `Method: ${contract.payment_method}${contract.payment_schedule ? ` · ${contract.payment_schedule}` : ""}`
    : "";
  // Migration 147: va_job_contracts is the pay source of truth. The legacy
  // users.payment_details column only feeds the notes when the VA has no
  // contract row at all, and is marked "(legacy)".
  const legacyPaymentDetails = contract ? null : p?.payment_details;
  const notes = [paymentLine, legacyPaymentDetails ? `(legacy) ${legacyPaymentDetails}` : null].filter(Boolean).join("\n");

  const initial: InvoiceInitial = {
    invoiceNo,
    invoiceDate: formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" }),
    periodLabel: monthLabel,
    currency: ccy,
    fromName: user.full_name ?? user.email,
    fromContact,
    billTo: client?.name ?? "Client",
    notes,
    lines: [{
      description: `Virtual assistant services — ${monthLabel}`,
      amount: earn.amount != null ? earn.amount.toFixed(2) : "",
    }],
    days: days.map((d) => ({ work_date: d.work_date, hours: d.hours, note: d.note })),
    daysCount: earn.days,
    hoursCount: earn.hours,
    monthLabel,
  };

  return <InvoiceBuilder initial={initial} />;
}
