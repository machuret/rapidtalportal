"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, Copy, Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { cn, formatDate } from "@/lib/utils";
import { categoryColor } from "@/lib/tasks/category-colors";
import type { ClientReportData } from "@/app/(portal)/reports/report-data";

const fmtDate = (iso: string) => iso ? formatDate(iso, { day: "numeric", month: "short" }) : "";

function toPlainText(d: ClientReportData): string {
  const L: string[] = [];
  L.push(`${d.clientName} — Monthly Report — ${d.monthLabel}`, "");
  L.push(`Delivered: ${d.totals.delivered}`);
  if (d.totals.onTimePct !== null) L.push(`On time: ${d.totals.onTimePct}%`);
  L.push(`Hours worked: ${d.totals.hours}`);
  L.push(`Work requested: ${d.totals.requested}`);
  if (d.totals.content) L.push(`Content produced: ${d.totals.content}`);
  if (d.totals.toolRuns) L.push(`AI tools used: ${d.totals.toolRuns}`);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  L.push("", `vs ${d.prevMonthLabel}: delivered ${sign(d.totals.delivered - d.prevTotals.delivered)}, hours ${sign(Math.round((d.totals.hours - d.prevTotals.hours) * 10) / 10)}`);
  if (d.vaRows.length) {
    L.push("", "Team:");
    for (const v of d.vaRows) L.push(`- ${v.name}: ${v.delivered} delivered${v.onTimePct !== null ? `, ${v.onTimePct}% on time` : ""}, ${v.hours}h`);
  }
  if (d.delivered.length) {
    L.push("", "Delivered this month:");
    for (const t of d.delivered) L.push(`- ${t.title}${t.completedAt ? ` (${fmtDate(t.completedAt)})` : ""}`);
  }
  L.push("", "Prepared by RapidTal.");
  return L.join("\n");
}

export function ClientReport({ data }: { data: ClientReportData }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const t = data.totals;
  const p = data.prevTotals;

  async function copy() {
    try {
      await navigator.clipboard.writeText(toPlainText(data));
      setCopied(true); setTimeout(() => setCopied(false), 1800);
      toast.success("Report copied — paste it into an email.");
    } catch { toast.error("Couldn't copy."); }
  }

  return (
    <div>
      {/* Controls (hidden when printing) */}
      <div className="flex flex-wrap items-center gap-3 mb-5 no-print">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Monthly report</h1>
          <p className="text-zinc-400 text-sm mt-0.5">A shareable summary of what was delivered.</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {pending && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
          <select
            value={data.monthKey}
            disabled={pending}
            onChange={(e) => startTransition(() => router.push(`/reports?month=${e.target.value}`))}
            className="bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-200 disabled:opacity-60"
          >
            {data.months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button onClick={copy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />} Copy for email
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors">
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </div>

      {/* The document sheet — always light (reads like a real report and prints
          clean). data-theme="dark" re-pins tokens so it stays white in either app theme. */}
      <div data-theme="dark" className="report-sheet bg-white text-zinc-900 rounded-xl border border-zinc-200 shadow-xl mx-auto max-w-3xl p-8 sm:p-10">
        {/* Letterhead */}
        <div className="flex items-start justify-between border-b border-zinc-200 pb-5 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Monthly Report</p>
            <h2 className="text-2xl font-bold text-zinc-900 mt-1">{data.clientName || "Your company"}</h2>
            <p className="text-zinc-500 text-sm mt-0.5">{data.monthLabel}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-zinc-900">RapidTal</p>
            <p className="text-xs text-zinc-400 mt-0.5">Generated {formatDate(data.generatedAt)}</p>
          </div>
        </div>

        {/* Headline numbers, with month-over-month change vs the prior month */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-2">
          <Metric value={t.delivered} label="Delivered" delta={t.delivered - p.delivered} dir="up" />
          <Metric
            value={t.onTimePct === null ? "—" : `${t.onTimePct}%`} label="On time" dir="up" suffix="pp"
            delta={t.onTimePct === null || p.onTimePct === null ? null : t.onTimePct - p.onTimePct}
          />
          <Metric value={t.hours} label="Hours worked" delta={Math.round((t.hours - p.hours) * 10) / 10} dir="neutral" />
          <Metric value={t.requested} label="Requested" delta={t.requested - p.requested} dir="neutral" />
        </div>
        <p className="text-xs text-zinc-400 mb-8">Change vs {data.prevMonthLabel}.</p>

        {(t.content > 0 || t.toolRuns > 0) && (
          <p className="text-sm text-zinc-500 mb-8 -mt-3">
            Also this month:
            {t.content > 0 && <> {t.content} piece{t.content !== 1 ? "s" : ""} of content produced.</>}
            {t.toolRuns > 0 && <> {t.toolRuns} AI tool run{t.toolRuns !== 1 ? "s" : ""}.</>}
          </p>
        )}

        {/* Team */}
        {data.vaRows.length > 0 && (
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wide">Your team</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-200">
                  <th className="text-left font-medium py-2">VA</th>
                  <th className="text-right font-medium py-2 px-3">Delivered</th>
                  <th className="text-right font-medium py-2 px-3">On time</th>
                  <th className="text-right font-medium py-2">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.vaRows.map((v) => (
                  <tr key={v.name} className="border-b border-zinc-100 last:border-0">
                    <td className="py-2 text-zinc-800">{v.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{v.delivered}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{v.onTimePct === null ? "—" : `${v.onTimePct}%`}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-700">{v.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Categories */}
        {data.categories.length > 0 && (
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wide">Where the work went</h3>
            <div className="flex flex-wrap gap-2">
              {data.categories.map((c) => (
                <span key={c.name} className="inline-flex items-center gap-1.5 text-sm text-zinc-700 bg-zinc-100 rounded-full px-3 py-1">
                  <span className={cn("w-2 h-2 rounded-full", categoryColor(c.color).swatch)} />
                  {c.name} <span className="text-zinc-400">· {c.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Delivered work */}
        <section>
          <h3 className="text-sm font-semibold text-zinc-900 mb-3 uppercase tracking-wide">Delivered this month</h3>
          {data.delivered.length === 0 ? (
            <p className="text-sm text-zinc-400">No completed work recorded for this month yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {data.delivered.map((d, i) => (
                <li key={i} className="flex items-baseline gap-3 py-2">
                  <Check className="w-3.5 h-3.5 text-green-600 shrink-0 translate-y-0.5" />
                  <span className="flex-1 text-sm text-zinc-800">{d.title}</span>
                  {d.vaName && <span className="text-xs text-zinc-400 shrink-0">{d.vaName.split(" ")[0]}</span>}
                  <span className="text-xs text-zinc-400 shrink-0 w-12 text-right">{fmtDate(d.completedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-zinc-400 text-center mt-10 pt-5 border-t border-zinc-200">
          Prepared by RapidTal · {data.clientName} · {data.monthLabel}
        </p>
      </div>
    </div>
  );
}

function Metric({
  value, label, delta, dir = "neutral", suffix = "",
}: {
  value: number | string;
  label: string;
  delta?: number | null;
  dir?: "up" | "neutral";
  suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3.5">
      <p className="text-3xl font-bold text-zinc-900 leading-none tabular-nums">{value}</p>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-zinc-500">{label}</p>
        <MetricDelta delta={delta} dir={dir} suffix={suffix} />
      </div>
    </div>
  );
}

/** Month-over-month change chip. Up is good for delivered/on-time (green when
 * positive); hours/requested are neutral (zinc) since neither direction is
 * inherently "better". Hidden when there's no prior data or no change. */
function MetricDelta({ delta, dir, suffix }: { delta?: number | null; dir: "up" | "neutral"; suffix: string }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  const tone = dir === "neutral"
    ? "text-zinc-400"
    : up ? "text-green-600" : "text-red-600";
  const mag = Math.abs(Math.round(delta * 10) / 10);
  return (
    <span className={cn("text-xs font-medium tabular-nums", tone)}>
      {up ? "▲" : "▼"} {mag}{suffix}
    </span>
  );
}
