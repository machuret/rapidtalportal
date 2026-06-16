"use client";

/**
 * Admin editor for a VA's "My Job" contract terms (rate, pay, start date,
 * hours, notice, next review). Saves to /api/my-job/contract; the VA sees
 * these on their My Job → Overview as read-only key terms.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Loader2, Save, FileSignature, Upload, FileText, Trash2, Download } from "lucide-react";

export interface ContractInit {
  rate: number | null; currency: string | null; pay_period: string | null;
  payment_method: string | null; payment_schedule: string | null;
  start_date: string | null; weekly_hours: number | null;
  notice_period: string | null; next_review_date: string | null;
  annual_leave_days: number | null;
  contract_name: string | null;
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
    annual_leave_days: initial?.annual_leave_days != null ? String(initial.annual_leave_days) : "",
  });

  function set<K extends keyof typeof f>(k: K, v: string) { setF((p) => ({ ...p, [k]: v })); }

  // ── Signed contract PDF ────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [docName, setDocName] = useState<string | null>(initial?.contract_name ?? null);
  const [busy, setBusy] = useState<"" | "upload" | "download" | "remove">("");

  async function upload(file: File) {
    if (busy) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("userId", vaId);
      const res = await fetch(ROUTES.myJob.contractDocument(), { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      setDocName(json.contract_name ?? file.name);
      toast.success("Contract PDF uploaded.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function download() {
    if (busy) return;
    setBusy("download");
    try {
      const { url } = await api.get<{ url: string }>(ROUTES.myJob.contractDocument(vaId), { showErrorToast: false });
      window.open(url, "_blank");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open the file."); }
    finally { setBusy(""); }
  }

  async function removeDoc() {
    if (busy) return;
    setBusy("remove");
    try {
      await api.delete(ROUTES.myJob.contractDocument(vaId), undefined, { showErrorToast: false });
      setDocName(null);
      toast.success("Contract PDF removed.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove the file."); }
    finally { setBusy(""); }
  }

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
        annual_leave_days: f.annual_leave_days ? Number(f.annual_leave_days) : null,
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
        <div className="flex flex-col gap-1"><label className={lbl}>Currency</label>
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={input}>
            {Array.from(new Set([f.currency, "USD", "AUD", "PHP", "EUR", "GBP", "NZD", "CAD", "SGD"])).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
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
        <div className="flex flex-col gap-1"><label className={lbl}>Annual leave (days)</label><input type="number" min="0" max="366" step="1" value={f.annual_leave_days} onChange={(e) => set("annual_leave_days", e.target.value)} placeholder="20" className={input} /></div>
      </div>

      {/* Signed contract PDF */}
      <div className="mt-5 pt-4 border-t border-zinc-800">
        <p className={lbl + " mb-2"}>Signed contract (PDF)</p>
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
        {docName ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm text-zinc-200"><FileText className="w-4 h-4 text-emerald-400" /> {docName}</span>
            <button onClick={download} disabled={!!busy} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
              {busy === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50">
              {busy === "upload" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Replace
            </button>
            <button onClick={removeDoc} disabled={!!busy} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50">
              {busy === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove
            </button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy} className="gap-2">
            {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload PDF
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4">
        <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save terms</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
