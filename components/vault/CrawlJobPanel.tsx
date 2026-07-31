"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { vaultListKeys } from "@/hooks/useVaultList";
import { cn } from "@/lib/utils";
import { Globe, Loader2, CheckCircle2, AlertTriangle, X, Sparkles, RefreshCw } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { errorMessage } from "@/lib/error-message";

export interface CrawlJob {
  id: string;
  url: string;
  status: "crawling" | "ingesting" | "synthesizing" | "done" | "error";
  error: string | null;
  pages_total: number;
  pages_done: number;
  items_created: number;
  products_seen: number;
  pages_dropped: number;
  tokens_used: number;
  dossier_item_id: string | null;
  meta: { warning?: string; unverified?: string[]; cursor?: number };
  created_at: string;
}

const ACTIVE = new Set(["crawling", "ingesting", "synthesizing"]);
const POLL_MS = 4000;

const PHASE_LABEL: Record<string, string> = {
  crawling: "Crawling the site",
  ingesting: "Reading & storing pages",
  synthesizing: "Writing the company dossier",
};

/**
 * Shows the running site-crawl for this client and DRIVES it: each poll calls
 * the advance endpoint, which performs one unit of work. Closing the tab only
 * pauses ingestion (Firecrawl keeps crawling) — reopening the Vault resumes.
 */
export function CrawlJobPanel({ clientId, startedJob }: { clientId: string; startedJob?: CrawlJob | null }) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<CrawlJob | null>(startedJob ?? null);
  const [dismissed, setDismissed] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const ticking = useRef(false);
  const consecutiveFailures = useRef(0);

  useEffect(() => {
    if (startedJob) {
      setJob(startedJob);
      setDismissed(false);
      setPollError(null);
      consecutiveFailures.current = 0;
    }
  }, [startedJob]);

  // Resume any job that was running when the page was last closed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { job: latest } = await api.get<{ job: CrawlJob | null }>(
          `${ROUTES.vault.crawlSite()}?clientId=${clientId}`, { showErrorToast: false },
        );
        if (!cancelled && latest && ACTIVE.has(latest.status)) setJob(latest);
      } catch { /* no job to resume */ }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const advance = useCallback(async () => {
    if (!job || !ACTIVE.has(job.status) || ticking.current) return;
    ticking.current = true;
    try {
      const { job: next } = await api.post<{ job: CrawlJob }>(
        ROUTES.vault.crawlSiteAdvance(), { jobId: job.id }, { showErrorToast: false },
      );
      consecutiveFailures.current = 0;
      setPollError(null);
      setJob(next);
      if (next.status === "done" || (next.status === "ingesting" && (next.meta.cursor ?? 0) > 0)) {
        queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
      }
    } catch (error) {
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= 3) {
        setPollError(errorMessage(
          error,
          "The crawl is still saved, but progress checks are failing.",
        ));
      }
    } finally {
      ticking.current = false;
    }
  }, [job, clientId, queryClient]);

  useEffect(() => {
    if (!job || !ACTIVE.has(job.status)) return;
    const t = setInterval(() => { void advance(); }, POLL_MS);
    void advance();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  if (!job || dismissed) return null;
  const host = (() => { try { return new URL(job.url).hostname; } catch { return job.url; } })();
  const isActive = ACTIVE.has(job.status);
  const pct = job.pages_total > 0 ? Math.min(100, Math.round((job.pages_done / job.pages_total) * 100)) : 0;

  return (
    <div className={cn(
      "rounded-xl border p-4 mb-6",
      job.status === "error" ? "border-red-500/40 bg-red-500/5"
        : job.status === "done" ? "border-green-500/40 bg-green-500/5"
        : "border-blue-500/40 bg-blue-500/5",
    )}>
      <div className="flex items-center gap-2.5">
        {isActive ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          : job.status === "done" ? <CheckCircle2 className="w-4 h-4 text-green-400" />
          : <AlertTriangle className="w-4 h-4 text-red-400" />}
        <p className="text-sm font-medium text-zinc-100">
          {isActive ? `${PHASE_LABEL[job.status]} — ${host}`
            : job.status === "done" ? `Site crawl complete — ${host}`
            : `Site crawl failed — ${host}`}
        </p>
        {job.status === "crawling" && job.pages_total > 0 && (
          <span className="text-xs text-zinc-400">{job.pages_done}/{job.pages_total} pages</span>
        )}
        {!isActive && (
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss crawl status"
            title="Dismiss"
            className="ml-auto p-1 text-zinc-500 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {job.status === "crawling" && (
        <ProgressBar value={pct} min={4} trackClassName="mt-3 h-1.5 w-full" barClassName="bg-orange-500 duration-700" />
      )}

      {isActive && (
        <p className="text-xs text-zinc-400 mt-2">
          {job.items_created > 0 && `${job.items_created} pages stored · `}
          {job.products_seen > 0 && `${job.products_seen} catalog pages → product summary · `}
          {job.pages_dropped > 0 && `${job.pages_dropped} skipped (no knowledge value) · `}
          You can leave this page — the crawl resumes whenever the Vault is open.
        </p>
      )}

      {isActive && pollError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-amber-200">Progress could not be refreshed after three attempts.</p>
            <p className="mt-0.5 break-words text-xs text-amber-300/80">{pollError}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              consecutiveFailures.current = 0;
              setPollError(null);
              void advance();
            }}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-200 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Retry now
          </button>
        </div>
      )}

      {job.status === "done" && (
        <div className="mt-2 text-xs text-zinc-300 space-y-1">
          <p>
            {job.items_created} vault item{job.items_created !== 1 ? "s" : ""} created
            {job.products_seen > 0 && ` (incl. a product catalog from ${job.products_seen} pages)`}
            {job.dossier_item_id && " + a full Company Dossier"}
            {job.pages_dropped > 0 && ` · ${job.pages_dropped} low-value pages skipped`}.
          </p>
          {job.meta.warning && <p className="text-amber-400">{job.meta.warning}</p>}
          {(job.meta.unverified?.length ?? 0) > 0 && (
            <p className="text-amber-400">
              ⚠ {job.meta.unverified!.length} figure{job.meta.unverified!.length !== 1 ? "s" : ""} in the dossier
              couldn&apos;t be verified against the site — flagged inside the dossier.
            </p>
          )}
          <p className="text-zinc-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Spot-check it: open RapidTal Coach and try &quot;What&apos;s the shipping policy?&quot;,
            &quot;What do they sell and at what prices?&quot;, &quot;How do returns work?&quot;
          </p>
        </div>
      )}

      {job.status === "error" && (
        <p className="text-xs text-red-300 mt-2">{job.error ?? "Unknown error."} Pages stored before the failure are kept.</p>
      )}

      {isActive && (
        <div className="flex items-center gap-1.5 mt-2 text-2xs text-zinc-500">
          <Globe className="w-3 h-3" />
          {job.status === "crawling"
            ? "Firecrawl is fetching pages on its own infrastructure…"
            : job.status === "ingesting"
            ? "Classifying pages: policies/about/FAQ stored in full, catalog pages aggregated, junk dropped."
            : "Map-reduce synthesis: per-page notes → full dossier with verified figures."}
        </div>
      )}
    </div>
  );
}
