"use client";

/**
 * Editable invoice. Pre-filled from the VA's logged days + contract rate as a
 * starting point, but every field is free: line items, amounts, dates, parties
 * and notes can all be changed, cleared, or added to — so a VA can bill a fixed
 * fee, a project, or anything that isn't tied to hours.
 *
 * Document tool only (print / save as PDF) — no payment processing and nothing
 * stored server-side. A per-invoice draft is kept in localStorage so a refresh
 * doesn't lose work; "Reset" restores the auto-filled version from logged days.
 *
 * Inputs are styled to look like plain text and print cleanly (no borders/chrome
 * on paper); the edit affordance only shows on screen.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { DocumentShell } from "@/components/my-job/DocumentShell";
import { fmtMoney } from "@/lib/my-job/pay";

export interface InvoiceLineInit { description: string; amount: string }
export interface InvoiceDayRow { work_date: string; hours: number | null; note: string | null }
export interface InvoiceInitial {
  invoiceNo: string;
  invoiceDate: string;
  periodLabel: string;
  currency: string;
  fromName: string;
  fromContact: string;
  billTo: string;
  notes: string;
  lines: InvoiceLineInit[];
  days: InvoiceDayRow[];
  daysCount: number;
  hoursCount: number;
  monthLabel: string;
}

interface Line { id: string; description: string; amount: string }
interface InvoiceDoc {
  invoiceNo: string;
  invoiceDate: string;
  periodLabel: string;
  currency: string;
  fromName: string;
  fromContact: string;
  billTo: string;
  notes: string;
  lines: Line[];
  showAttachment: boolean;
}

const DRAFT_PREFIX = "my-job:invoice-draft:";

/** Parse a free-typed amount ("1,200.50", "$500") into a number. */
function parseAmount(a: string): number {
  const n = Number(a.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function buildDoc(init: InvoiceInitial): InvoiceDoc {
  return {
    invoiceNo: init.invoiceNo,
    invoiceDate: init.invoiceDate,
    periodLabel: init.periodLabel,
    currency: init.currency,
    fromName: init.fromName,
    fromContact: init.fromContact,
    billTo: init.billTo,
    notes: init.notes,
    lines: init.lines.map((l, i) => ({ id: `l${i}`, description: l.description, amount: l.amount })),
    showAttachment: true,
  };
}

// On-paper editable field: looks like text, subtle highlight on screen only.
const field =
  "bg-transparent rounded px-1 -mx-1 outline-none transition-colors hover:bg-zinc-100 focus:bg-zinc-100 print:hover:bg-transparent print:focus:bg-transparent";

export function InvoiceBuilder({ initial }: { initial: InvoiceInitial }) {
  const [doc, setDoc] = useState<InvoiceDoc>(() => buildDoc(initial));
  const [loaded, setLoaded] = useState(false);
  const nextId = useRef(initial.lines.length);
  const draftKey = DRAFT_PREFIX + initial.invoiceNo;

  // Restore any saved draft for this invoice once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw) as InvoiceDoc;
        setDoc(saved);
        nextId.current = saved.lines.length;
      }
    } catch { /* ignore a corrupt draft */ }
    setLoaded(true);
  }, [draftKey]);

  // Persist after load so we never overwrite a draft with the initial state.
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(draftKey, JSON.stringify(doc)); } catch { /* quota / private mode */ }
  }, [doc, loaded, draftKey]);

  function set<K extends keyof InvoiceDoc>(key: K, value: InvoiceDoc[K]) {
    setDoc((d) => ({ ...d, [key]: value }));
  }
  function setLine(id: string, next: Partial<Line>) {
    setDoc((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...next } : l)) }));
  }
  function addLine() {
    setDoc((d) => ({ ...d, lines: [...d.lines, { id: `l${nextId.current++}`, description: "", amount: "" }] }));
  }
  function removeLine(id: string) {
    setDoc((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  }
  function reset() {
    if (!confirm("Reset this invoice to the auto-filled version from your logged days? Your edits will be cleared.")) return;
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    const fresh = buildDoc(initial);
    nextId.current = initial.lines.length;
    setDoc(fresh);
  }

  const total = doc.lines.reduce((s, l) => s + parseAmount(l.amount), 0);
  const ccy = doc.currency.trim() || "USD";

  return (
    <div>
      {/* Builder controls — screen only */}
      <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Currency
          <input
            value={doc.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            maxLength={6}
            className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={doc.showAttachment} onChange={(e) => set("showAttachment", e.target.checked)} className="accent-emerald-500" />
          Attach days-worked summary
        </label>
        <button
          onClick={reset}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-sm px-3 py-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset to logged days
        </button>
      </div>

      <DocumentShell>
        {/* Header */}
        <div className="flex items-start justify-between gap-6 mb-10">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
            <input value={doc.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} aria-label="Invoice number"
              className={`${field} text-sm text-zinc-500 mt-1 w-full`} />
          </div>
          <div className="w-1/2 max-w-xs text-right text-sm">
            <input value={doc.fromName} onChange={(e) => set("fromName", e.target.value)} aria-label="Your name"
              className={`${field} font-semibold w-full text-right`} />
            <textarea value={doc.fromContact} onChange={(e) => set("fromContact", e.target.value)} aria-label="Your contact details" rows={3}
              className={`${field} text-zinc-600 w-full text-right resize-none mt-0.5`} />
          </div>
        </div>

        {/* Parties / dates */}
        <div className="grid grid-cols-2 gap-8 mb-10 text-sm">
          <div>
            <p className="text-2xs uppercase tracking-wide text-zinc-400 mb-1">Bill to</p>
            <textarea value={doc.billTo} onChange={(e) => set("billTo", e.target.value)} aria-label="Bill to" rows={3}
              className={`${field} font-semibold w-full resize-none`} />
          </div>
          <div className="text-right">
            <label className="block">
              <span className="text-zinc-500">Invoice date: </span>
              <input value={doc.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} aria-label="Invoice date"
                className={`${field} text-right`} />
            </label>
            <label className="block mt-1">
              <span className="text-zinc-500">Period: </span>
              <input value={doc.periodLabel} onChange={(e) => set("periodLabel", e.target.value)} aria-label="Period"
                className={`${field} text-right`} />
            </label>
          </div>
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-left">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 font-semibold text-right w-40">Amount</th>
              <th className="w-8 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id} className="border-b border-zinc-200 align-top">
                <td className="py-2.5">
                  <textarea value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} aria-label="Line description" rows={1}
                    className={`${field} w-full resize-none`} placeholder="Description of work…" />
                </td>
                <td className="py-2.5 text-right">
                  <input value={l.amount} onChange={(e) => setLine(l.id, { amount: e.target.value })} aria-label="Line amount" inputMode="decimal"
                    className={`${field} w-full text-right font-medium`} placeholder="0.00" />
                </td>
                <td className="py-2.5 text-right print:hidden">
                  <button onClick={() => removeLine(l.id)} className="text-zinc-300 hover:text-red-500 transition-colors" title="Remove line" aria-label="Remove line">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 text-right font-semibold">Total due</td>
              <td className="py-3 text-right text-lg font-bold">{fmtMoney(total, ccy)}</td>
              <td className="print:hidden" />
            </tr>
          </tfoot>
        </table>

        <button onClick={addLine}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-10 print:hidden">
          <Plus className="w-4 h-4" /> Add line item
        </button>

        {/* Notes / payment details */}
        <div className="mb-10 text-sm">
          <p className="text-2xs uppercase tracking-wide text-zinc-400 mb-1">Payment details &amp; notes</p>
          <textarea value={doc.notes} onChange={(e) => set("notes", e.target.value)} aria-label="Payment details and notes" rows={3}
            className={`${field} text-zinc-600 w-full resize-none`} placeholder="How you'd like to be paid, terms, thank-you note…" />
        </div>

        {/* Optional days-worked attachment */}
        {doc.showAttachment && (
          <div className="pt-6 border-t border-zinc-200 break-inside-avoid">
            <p className="text-2xs uppercase tracking-wide text-zinc-400 mb-2">
              Attachment — days worked in {initial.monthLabel} ({initial.daysCount} days{initial.hoursCount ? `, ${initial.hoursCount} hrs` : ""})
            </p>
            {initial.days.length === 0 ? (
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
                  {initial.days.map((d) => (
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
        )}

        <p className="text-3xs text-zinc-400 mt-10">
          Generated by RapidTal Portal. This is a billing document only — payment is arranged directly between the parties.
        </p>
      </DocumentShell>
    </div>
  );
}
