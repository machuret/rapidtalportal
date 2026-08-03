"use client";

import { Loader2, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProspectingJob } from "@/types/prospecting";

export function ProspectingActiveJob({
  job,
  cancelling,
  onCancel,
}: {
  job: ProspectingJob;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const enrichment = job.job_type === "enrichment";
  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
          <div>
            <p className="font-medium text-blue-100">
              {job.cancel_requested_at
                ? `Cancelling ${enrichment ? "company enrichment" : "lead collection"}`
                : enrichment ? "Enriching a company website" : "Finding leads in the background"}
            </p>
            <p className="mt-0.5 text-xs text-blue-200/70">
              {enrichment
                ? "Reviewing up to five company pages. You can leave this page; RapidTal will keep working."
                : `Requested ${job.requested_results} results. You can leave this page; RapidTal will keep working.`}
            </p>
            {job.error_message && <p className="mt-1 text-xs text-amber-200">{job.error_message}</p>}
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={Boolean(job.cancel_requested_at) || cancelling} onClick={onCancel}>
          {cancelling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <StopCircle className="mr-1.5 h-3.5 w-3.5" />}
          {job.cancel_requested_at ? "Cancelling" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
