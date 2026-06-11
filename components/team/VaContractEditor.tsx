"use client";

/**
 * Admin editor for a VA's "My Job" contract terms (rate, pay, start date,
 * hours, notice, next review). Saves to /api/my-job/contract; the VA sees
 * these on their My Job → Overview as read-only key terms.
 */
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Loader2, Save, FileSignature } from "lucide-react";

export interface ContractInit {
  rate: number | null; currency: string | null; pay_period: string | null;
  payment_method: string | null; payment_schedule: string | null;
  start_date: string | null; weekly_hours: number | null;
  notice_period: string | null; next_review_date: string | null;
}

export function VaContractEditor({ vaId, initial }: { vaId: string; initial: ContractInit | null }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    rate: initial?.rate != null ? String(initial.rate) : "",
    currency: initial?.currency ?? "USD",
    pay_period: initial?.pay_period ?? "monthly",
    payment_method: initial?.payment_method ?? "",
    payment_schedule: initial?.payment_schedule ?? "",
    start_date: initial?.start_date ?? "",
    weekly_hours: initial?.weekly_hours != null ? String(initial.weekly_hours) : "",
    notice_period: initial?.notice_period ?? "",
    next_review_date: initial?.next_review_date ?? "",
  });

  function set<K extends keyof typeof f>(k: K, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api.put(ROUTES.myJob.contract(), {
        userId: vaId,
        rate: f.rate ? Number(f.rate) : null,
        currency: f.currency || "USD",
        pay_period: f.pay_period,
        payment_method: f.payment_method.trim() || null,
        payment_schedule: f.payment_schedule.trim() || null,
        start_date: f.start_date || null,
        weekly_hours: f.weekly_hours ? Number(f.weekly_hours) : null,
        notice_period: f.notice_period.trim() || null,
        next_review_date: f.next_review_date || null,
      }, { showErrorToast: false });
      toast.success("Contract terms saved.");
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the contract."); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <FileSignature className="w-4 h-4" /> Edit job & contract
      </Button>
    );
  }

  const input = "bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5 w-full";
  const lbl = "text-[11px] uppercase tracking-wide text-zinc-500";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <FileSignature className="w-4 h-4 text-zinc-500" /> Job & contract terms
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1"><label className={lbl}>Rate</label><input type="number" min="0" step="0.01" value={f.rate} onChange={(e) => set("rate", e.target.value)} className={input} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Currency</label><input value={f.currency} onChange={(e) => set("currency", e.target.value)} className={input} maxLength={8} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Pay period</label>
          <select value={f.pay_period} onChange={(e) => set("pay_period", e.target.value)} className={input}>
            <option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="flex flex-col gap-1"><label className={lbl}>Payment method</label><input value={f.payment_method} onChange={(e) => set("payment_method", e.target.value)} placeholder="Wise, PayPal…" className={input} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Payment schedule</label><input value={f.payment_schedule} onChange={(e) => set("payment_schedule", e.target.value)} placeholder="1st of the month" className={input} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Weekly hours</label><input type="number" min="0" max="168" step="0.5" value={f.weekly_hours} onChange={(e) => set("weekly_hours", e.target.value)} className={input} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Start date</label><input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} className={input} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Notice period</label><input value={f.notice_period} onChange={(e) => set("notice_period", e.target.value)} placeholder="30 days" className={input} /></div>
        <div className="flex flex-col gap-1"><label className={lbl}>Next review date</label><input type="date" value={f.next_review_date} onChange={(e) => set("next_review_date", e.target.value)} className={input} /></div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save terms</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
