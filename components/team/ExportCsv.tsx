"use client";

import { Download } from "lucide-react";

/** Client-side CSV download — no endpoint needed, the page already has the rows. */
export function ExportCsv({ rows, filename }: { rows: Record<string, string | number>[]; filename: string }) {
  function download() {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: string | number) => {
      let s = String(v);
      // Neutralise spreadsheet formula injection: a value starting with =, +, -,
      // @ (or a control char) can execute as a formula in Excel/Sheets. A VA's
      // own full_name/email flows into these rows, so prefix with a single quote.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      disabled={!rows.length}
      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
    >
      <Download className="w-3.5 h-3.5" /> Export CSV
    </button>
  );
}
