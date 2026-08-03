"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActionOutcomeState {
  title: string;
  message: string;
  actionLabel: string;
  href: string;
}

/** Durable in-page confirmation for actions whose useful next step matters
 * after a short-lived toast disappears. */
export function ActionOutcome({ outcome, onDismiss }: { outcome: ActionOutcomeState; onDismiss: () => void }) {
  return (
    <section role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-green-500/25 bg-green-500/5 px-4 py-3">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-green-100">{outcome.title}</p>
        <p className="mt-0.5 text-xs text-zinc-400">{outcome.message}</p>
      </div>
      <Link href={outcome.href} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5 border-green-500/25")}>{outcome.actionLabel}<ArrowRight className="h-3.5 w-3.5" /></Link>
      <button type="button" onClick={onDismiss} aria-label="Dismiss success message" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>
    </section>
  );
}
