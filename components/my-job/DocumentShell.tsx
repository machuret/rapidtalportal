"use client";

/**
 * Shell for printable My Job documents (invoice, COE, tax summary).
 * On screen: a white A4-style "paper" with a toolbar (back + Print / Save as
 * PDF via the browser's print dialog). On print: just the paper — the portal
 * layout hides its chrome with print:hidden.
 */
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export function DocumentShell({ children, backHref = "/my-job" }: { children: React.ReactNode; backHref?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to My Job
        </Link>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 transition-colors">
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="bg-white text-zinc-900 rounded-xl shadow-2xl mx-auto max-w-[210mm] p-10 md:p-14 print:shadow-none print:rounded-none print:p-10 print:max-w-none">
        {children}
      </div>

      <p className="text-[11px] text-zinc-600 text-center mt-4 print:hidden">
        Use your browser&apos;s print dialog and choose &quot;Save as PDF&quot; to download this document.
      </p>
    </div>
  );
}
