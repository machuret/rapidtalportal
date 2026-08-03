"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  MapPin,
  Phone,
  Play,
  Search,
  Star,
  UserPlus,
  X,
  StopCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/api/routes";
import type {
  ProspectingCampaign,
  ProspectingCampaignPage,
  ProspectingJob,
  ProspectingLead,
  ProspectingLeadPage,
  ProspectingLeadStatus,
} from "@/types/prospecting";

type Tab = "find" | "inbox" | "campaigns";
const TERMINAL = new Set(["done", "error", "cancelled"]);
const PAGE_SIZE = 30;

function keywordList(value: string): string[] {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function fitClass(band: ProspectingLead["fit_band"]): string {
  if (band === "strong") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (band === "possible") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-800 text-zinc-300";
}

function statusLabel(status: string): string {
  return ({
    ready: "Ready",
    running: "Collecting",
    completed: "Completed",
    failed: "Needs retry",
    done: "Completed",
    error: "Needs retry",
    cancelled: "Cancelled",
    new: "New",
    shortlisted: "Shortlisted",
    dismissed: "Dismissed",
    imported: "In CRM",
  } as Record<string, string>)[status] ?? status;
}

function statusClass(status: string): string {
  if (["completed", "done", "imported"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (["running", "queued", "ingesting"].includes(status)) return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  if (["failed", "error"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "shortlisted") return "bg-orange-500/10 text-orange-300 border-orange-500/20";
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

export function LeadGenerationWorkspace({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<Tab>("find");
  const [campaigns, setCampaigns] = useState<ProspectingCampaign[]>([]);
  const [leads, setLeads] = useState<ProspectingLead[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<ProspectingLeadStatus | "all">("all");
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [activeJobs, setActiveJobs] = useState<ProspectingJob[]>([]);
  const [campaignTotal, setCampaignTotal] = useState(0);
  const [usage, setUsage] = useState<ProspectingCampaignPage["usage"]>({
    runs_started: 0,
    results_reserved: 0,
    results_returned: 0,
    reported_cost_usd: 0,
    enrichments_started: 0,
    enrichment_pages: 0,
  });
  const [pollIssue, setPollIssue] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState<"google_maps" | "google_search">("google_maps");
  const [maxResults, setMaxResults] = useState(20);
  const [showMatching, setShowMatching] = useState(false);
  const [requiredKeywords, setRequiredKeywords] = useState("");
  const [preferredKeywords, setPreferredKeywords] = useState("");
  const [excludedKeywords, setExcludedKeywords] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [minReviewCount, setMinReviewCount] = useState(0);
  const [mustHaveWebsite, setMustHaveWebsite] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const pollBusy = useRef(false);
  const pollFailures = useRef(0);
  const startBusy = useRef(false);
  const activeJobsRef = useRef<ProspectingJob[]>([]);

  useEffect(() => {
    activeJobsRef.current = activeJobs;
  }, [activeJobs]);

  const loadCampaigns = useCallback(async (nextOffset = 0, append = false) => {
    if (!append) setLoadingCampaigns(true);
    try {
      const result = await api.get<ProspectingCampaignPage>(
        ROUTES.prospecting.campaignsForClient(clientId, nextOffset),
        { showErrorToast: false },
      );
      setCampaigns((current) => append ? [...current, ...result.campaigns] : result.campaigns);
      setCampaignTotal(result.total);
      setUsage(result.usage);
      const running = result.campaigns.map((campaign) => campaign.latest_job)
        .filter((job): job is ProspectingJob => Boolean(job && !TERMINAL.has(job.status)));
      setActiveJobs((current) => {
        const retained = append ? current : current.filter((job) => job.job_type === "enrichment");
        const byId = new Map(retained.map((job) => [job.id, job]));
        for (const job of running) byId.set(job.id, job);
        return Array.from(byId.values());
      });
    } catch (error) {
      toast.error(errorMessage(error, "Campaigns could not be loaded."));
    } finally {
      setLoadingCampaigns(false);
    }
  }, [clientId]);

  const loadLeads = useCallback(async (
    nextOffset: number,
    nextFilter: ProspectingLeadStatus | "all",
  ) => {
    setLoadingLeads(true);
    try {
      const result = await api.get<ProspectingLeadPage>(
        ROUTES.prospecting.leadsPage(clientId, nextFilter, nextOffset, PAGE_SIZE),
        { showErrorToast: false },
      );
      setLeads(result.leads);
      setTotal(result.total);
      setOffset(result.offset);
      const enriching = result.leads.map((lead) => lead.active_enrichment_job)
        .filter((job): job is ProspectingJob => Boolean(job && !TERMINAL.has(job.status)));
      if (enriching.length) {
        setActiveJobs((current) => {
          const byId = new Map(current.map((job) => [job.id, job]));
          for (const job of enriching) byId.set(job.id, job);
          return Array.from(byId.values());
        });
      }
    } catch (error) {
      toast.error(errorMessage(error, "Lead Inbox could not be loaded."));
    } finally {
      setLoadingLeads(false);
    }
  }, [clientId]);

  useEffect(() => {
    void Promise.all([loadCampaigns(), loadLeads(0, "all")]);
  }, [loadCampaigns, loadLeads]);

  const activeJobKey = activeJobs.map((job) => job.id).sort().join(",");
  useEffect(() => {
    if (!activeJobKey) return;
    const advance = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        const settled = await Promise.allSettled(activeJobsRef.current.map(async (activeJob) => {
          const result = await api.post<{ job: ProspectingJob | null; busy: boolean }>(
            ROUTES.prospecting.advance(),
            { clientId, jobId: activeJob.id },
            { showErrorToast: false },
          );
          return result.job;
        }));
        const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        const failedRefreshes = settled.filter((result) => result.status === "rejected").length;
        if (failedRefreshes === 0) {
          pollFailures.current = 0;
          setPollIssue(null);
        } else {
          pollFailures.current += 1;
          if (!navigator.onLine) setPollIssue("You are offline. Collection is continuing in the background.");
          else if (pollFailures.current >= 3) setPollIssue("Some collection progress cannot be refreshed right now. Background recovery is still running.");
        }
        let refreshLeads = false;
        for (const job of results) {
          if (!job) continue;
          if (job.status === "done") {
            toast.success(job.job_type === "enrichment"
              ? "Company enrichment is ready. Its fit score has been refreshed."
              : `${job.returned_results} leads are ready to review.`);
            refreshLeads = true;
          } else if (job.status === "error") {
            toast.error(job.error_message || (job.job_type === "enrichment"
              ? "Company enrichment did not finish. Try enriching this lead again."
              : "Lead collection did not finish. Run the campaign again."));
            if (job.job_type === "enrichment") refreshLeads = true;
          } else if (job.status === "cancelled") {
            toast.success(job.job_type === "enrichment" ? "Company enrichment cancelled." : "Lead collection cancelled.");
            if (job.job_type === "enrichment") refreshLeads = true;
          }
        }
        setActiveJobs((current) => current.map((currentJob) =>
          results.find((job) => job?.id === currentJob.id) ?? currentJob
        ).filter((job) => !TERMINAL.has(job.status)));
        if (results.some((job) => job && TERMINAL.has(job.status))) await loadCampaigns();
        if (refreshLeads) {
          setTab("inbox");
          await loadLeads(0, "all");
        }
      } catch {
        pollFailures.current += 1;
        if (!navigator.onLine) setPollIssue("You are offline. Collection is continuing in the background.");
        else if (pollFailures.current >= 3) setPollIssue("Progress cannot be refreshed right now. Background recovery is still running.");
      } finally {
        pollBusy.current = false;
      }
    };
    void advance();
    const timer = window.setInterval(() => void advance(), 4_000);
    return () => window.clearInterval(timer);
  }, [activeJobKey, clientId, loadCampaigns, loadLeads]);

  async function createAndRun() {
    if (startBusy.current) return;
    if (query.trim().length < 2 || location.trim().length < 2) {
      toast.error("Add what you are looking for and where to search.");
      return;
    }
    startBusy.current = true;
    setStarting(true);
    try {
      const created = await api.post<{ campaign: ProspectingCampaign }>(ROUTES.prospecting.campaigns(), {
        clientId,
        source,
        query: query.trim(),
        location: location.trim(),
        maxResults,
        idealProfile: {
          requiredKeywords: keywordList(requiredKeywords),
          preferredKeywords: keywordList(preferredKeywords),
          excludedKeywords: keywordList(excludedKeywords),
          minRating,
          minReviewCount,
          mustHaveWebsite,
        },
      });
      const started = await api.post<{ job: ProspectingJob }>(ROUTES.prospecting.runs(), {
        clientId,
        campaignId: created.campaign.id,
      });
      setCampaigns((current) => [{ ...created.campaign, latest_job: started.job }, ...current]);
      setCampaignTotal((current) => current + 1);
      setActiveJobs((current) => [started.job, ...current.filter((job) => job.id !== started.job.id)]);
      toast.success("Lead collection started. You can leave this page safely.");
    } catch (error) {
      toast.error(errorMessage(error, "Lead collection could not be started."));
      await loadCampaigns();
    } finally {
      startBusy.current = false;
      setStarting(false);
    }
  }

  async function runCampaign(campaign: ProspectingCampaign) {
    setPendingAction(`run:${campaign.id}`);
    try {
      const result = await api.post<{ job: ProspectingJob }>(ROUTES.prospecting.runs(), {
        clientId,
        campaignId: campaign.id,
      });
      setActiveJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
      toast.success("Campaign collection started.");
      await loadCampaigns();
    } catch (error) {
      toast.error(errorMessage(error, "Campaign could not be run."));
    } finally {
      setPendingAction(null);
    }
  }

  async function archiveCampaign(campaign: ProspectingCampaign) {
    setPendingAction(`archive:${campaign.id}`);
    try {
      await api.patch(ROUTES.prospecting.campaigns(), { clientId, id: campaign.id, archived: true });
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      setCampaignTotal((current) => Math.max(0, current - 1));
      toast.success("Campaign archived.");
    } catch (error) {
      toast.error(errorMessage(error, "Campaign could not be archived."));
    } finally {
      setPendingAction(null);
    }
  }

  async function updateLead(lead: ProspectingLead, status: "new" | "shortlisted" | "dismissed") {
    setPendingAction(`${status}:${lead.id}`);
    try {
      await api.patch(ROUTES.prospecting.leads(), { clientId, id: lead.id, status });
      if (filter !== "all" && filter !== status) {
        setLeads((current) => current.filter((item) => item.id !== lead.id));
        setTotal((current) => Math.max(0, current - 1));
      }
      else setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status } : item));
      toast.success(status === "shortlisted" ? "Lead shortlisted." : status === "dismissed" ? "Lead dismissed." : "Lead restored.");
    } catch (error) {
      toast.error(errorMessage(error, "Lead could not be updated."));
    } finally {
      setPendingAction(null);
    }
  }

  async function promoteLead(lead: ProspectingLead) {
    setPendingAction(`promote:${lead.id}`);
    try {
      await api.post(ROUTES.prospecting.promote(), { clientId, leadId: lead.id });
      if (filter !== "all" && filter !== "imported") {
        setLeads((current) => current.filter((item) => item.id !== lead.id));
        setTotal((current) => Math.max(0, current - 1));
      } else {
        setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, status: "imported" } : item));
      }
      toast.success("Lead added to CRM.");
    } catch (error) {
      toast.error(errorMessage(error, "Lead could not be added to CRM."));
    } finally {
      setPendingAction(null);
    }
  }

  async function enrichLead(lead: ProspectingLead) {
    setPendingAction(`enrich:${lead.id}`);
    try {
      const result = await api.post<{ job: ProspectingJob }>(ROUTES.prospecting.enrich(), {
        clientId,
        leadId: lead.id,
      });
      setActiveJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
      setLeads((current) => current.map((item) => item.id === lead.id
        ? { ...item, active_enrichment_job: result.job }
        : item));
      toast.success("Company enrichment started. You can keep reviewing leads.");
    } catch (error) {
      toast.error(errorMessage(error, "Company enrichment could not be started."));
    } finally {
      setPendingAction(null);
    }
  }

  async function cancelJob(job: ProspectingJob) {
    setPendingAction(`cancel:${job.id}`);
    try {
      const result = await api.post<{ job: ProspectingJob }>(ROUTES.prospecting.cancel(), {
        clientId,
        jobId: job.id,
      });
      if (TERMINAL.has(result.job.status)) {
        setActiveJobs((current) => current.filter((item) => item.id !== job.id));
        await Promise.all([loadCampaigns(), loadLeads(offset, filter)]);
      } else {
        setActiveJobs((current) => current.map((item) => item.id === job.id ? result.job : item));
      }
      toast.success(
        result.job.status === "cancelled"
          ? result.job.job_type === "enrichment" ? "Company enrichment cancelled." : "Lead collection cancelled."
          : result.job.status === "done"
            ? "Collection had already completed."
            : "Cancellation requested.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Lead collection could not be cancelled."));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3" role="tablist" aria-label="Lead Generation sections">
        {([
          ["find", "Find Leads"],
          ["inbox", "Lead Inbox"],
          ["campaigns", "Campaigns"],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === value ? "bg-orange-500 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeJobs.map((activeJob) => (
        <div key={activeJob.id} className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-300" />
              <div>
                <p className="font-medium text-blue-100">
                  {activeJob.cancel_requested_at
                    ? `Cancelling ${activeJob.job_type === "enrichment" ? "company enrichment" : "lead collection"}`
                    : activeJob.job_type === "enrichment" ? "Enriching a company website" : "Finding leads in the background"}
                </p>
                <p className="mt-0.5 text-xs text-blue-200/70">
                  {activeJob.job_type === "enrichment"
                    ? "Reviewing up to five company pages. You can leave this page; RapidTal will keep working."
                    : `Requested ${activeJob.requested_results} results. You can leave this page; RapidTal will keep working.`}
                </p>
                {activeJob.error_message && (
                  <p className="mt-1 text-xs text-amber-200">{activeJob.error_message}</p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(activeJob.cancel_requested_at) || pendingAction === `cancel:${activeJob.id}`}
              onClick={() => void cancelJob(activeJob)}
            >
              {pendingAction === `cancel:${activeJob.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <StopCircle className="mr-1.5 h-3.5 w-3.5" />}
              {activeJob.cancel_requested_at ? "Cancelling" : "Cancel"}
            </Button>
          </div>
        </div>
      ))}
      {pollIssue && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" role="alert">{pollIssue}</p>}

      {tab === "find" && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 md:p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Who do you want to find?</h2>
            <p className="mt-1 text-sm text-zinc-400">Describe the business type and location. Everything else is optional.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-query">Business type or service</Label>
              <Input id="lead-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Mortgage brokers" maxLength={300} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-location">Location</Label>
              <Input id="lead-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Sydney, Australia" maxLength={300} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-source">Where to search</Label>
              <select
                id="lead-source"
                value={source}
                onChange={(event) => setSource(event.target.value as typeof source)}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
              >
                <option value="google_maps">Google Maps — best for local businesses</option>
                <option value="google_search">Web search — broader company discovery</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-count">How many results?</Label>
              <select
                id="lead-count"
                value={maxResults}
                onChange={(event) => setMaxResults(Number(event.target.value))}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
              >
                {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value} leads</option>)}
              </select>
            </div>
          </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => void createAndRun()} disabled={starting}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Find leads
            </Button>
              <p className="text-xs text-zinc-500">Results are reviewed here first. Nothing is added to CRM automatically.</p>
            </div>
            {source === "google_search" && (
              <p className="mt-3 text-xs text-amber-300">Web search is broader and may return website candidates that need closer review.</p>
            )}
            <div className="mt-5 border-t border-zinc-800 pt-5">
              <button type="button" className="flex items-center gap-2 text-sm font-medium text-zinc-200 hover:text-white" onClick={() => setShowMatching((value) => !value)} aria-expanded={showMatching}>
                <Sparkles className="h-4 w-4 text-orange-400" />
                {showMatching ? "Hide ideal-customer matching" : "Improve matching (optional)"}
              </button>
              {showMatching && (
                <div className="mt-4 grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lead-required">Required terms</Label>
                    <Input id="lead-required" value={requiredKeywords} onChange={(event) => setRequiredKeywords(event.target.value)} placeholder="e.g. commercial lending, brokers" />
                    <p className="text-2xs text-zinc-500">Comma-separated. Missing required terms caps the fit score.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-preferred">Preferred terms</Label>
                    <Input id="lead-preferred" value={preferredKeywords} onChange={(event) => setPreferredKeywords(event.target.value)} placeholder="e.g. property, private credit" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-excluded">Exclude terms</Label>
                    <Input id="lead-excluded" value={excludedKeywords} onChange={(event) => setExcludedKeywords(event.target.value)} placeholder="e.g. residential only, recruitment" />
                    <p className="text-2xs text-zinc-500">A matched exclusion caps the result as a weak fit.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="lead-rating">Minimum rating</Label>
                      <select id="lead-rating" value={minRating} onChange={(event) => setMinRating(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm">
                        {[0, 3.5, 4, 4.5].map((value) => <option key={value} value={value}>{value ? `${value}+` : "Any"}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lead-reviews">Minimum reviews</Label>
                      <select id="lead-reviews" value={minReviewCount} onChange={(event) => setMinReviewCount(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm">
                        {[0, 10, 25, 50, 100].map((value) => <option key={value} value={value}>{value || "Any"}</option>)}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
                    <input type="checkbox" checked={mustHaveWebsite} onChange={(event) => setMustHaveWebsite(event.target.checked)} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900" />
                    A website is required for a good fit
                  </label>
                  <p className="flex items-start gap-2 text-xs text-zinc-500 md:col-span-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Fit scores are rule-based and show their components. Enrichment improves the evidence; it never changes your criteria.</p>
                </div>
              )}
            </div>
        </section>
      )}

      {tab === "inbox" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Lead Inbox</h2>
              <p className="text-sm text-zinc-400">Review, shortlist or add suitable companies to CRM.</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="lead-status" className="sr-only">Filter lead status</Label>
              <select
                id="lead-status"
                value={filter}
                onChange={(event) => {
                  const next = event.target.value as typeof filter;
                  setFilter(next);
                  void loadLeads(0, next);
                }}
                className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200"
              >
                <option value="all">All leads</option>
                <option value="new">New</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="imported">In CRM</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
          </div>
          {loadingLeads ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-zinc-800"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading leads" /></div>
          ) : leads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
              <Building2 className="mx-auto h-9 w-9 text-zinc-600" />
              <p className="mt-3 font-medium text-zinc-200">No leads in this view</p>
              <p className="mt-1 text-sm text-zinc-500">Run a search or choose a different status.</p>
              <Button variant="outline" className="mt-4" onClick={() => setTab("find")}>Find leads</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                {leads.map((lead) => {
                  const prospect = lead.prospect;
                  const title = prospect.person_name || prospect.company_name || "Unnamed lead";
                  const busy = pendingAction?.endsWith(lead.id);
                  return (
                    <article key={lead.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-zinc-100">{title}</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${statusClass(lead.status)}`}>{statusLabel(lead.status)}</span>
                            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-2xs text-zinc-400">{lead.campaign.name}</span>
                            {lead.fit_score !== null && (
                              <span className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${fitClass(lead.fit_band)}`}>
                                {lead.fit_score}/100 · {lead.fit_band ?? "unrated"} fit
                              </span>
                            )}
                          </div>
                          {prospect.industry && <p className="mt-1 text-xs text-zinc-400">{prospect.industry}</p>}
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
                            {(prospect.address || prospect.locality) && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{prospect.address || prospect.locality}</span>}
                            {prospect.phone && <a className="flex items-center gap-1.5 hover:text-white" href={`tel:${prospect.phone}`}><Phone className="h-3.5 w-3.5" />{prospect.phone}</a>}
                            {prospect.rating !== null && <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" />{prospect.rating}{prospect.review_count ? ` (${prospect.review_count})` : ""}</span>}
                            {prospect.website_url && <a className="flex items-center gap-1.5 text-orange-300 hover:text-orange-200" href={prospect.website_url} target="_blank" rel="noreferrer">Website <ExternalLink className="h-3.5 w-3.5" /></a>}
                          </div>
                          {lead.fit_breakdown?.explanation && <p className="mt-2 text-xs text-zinc-400">{lead.fit_breakdown.explanation}</p>}
                          {lead.fit_breakdown?.dimensions && (
                            <details className="mt-2 text-xs text-zinc-500">
                              <summary className="cursor-pointer hover:text-zinc-300">Why this score</summary>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(lead.fit_breakdown.dimensions).map(([name, value]) => (
                                  <span key={name} className="rounded-md bg-zinc-950 px-2 py-1">{name.replace(/([A-Z])/gu, " $1")}: {value.score}/{value.maximum}</span>
                                ))}
                              </div>
                            </details>
                          )}
                          {lead.latest_enrichment && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-blue-300">
                              <Globe2 className="h-3.5 w-3.5" />
                              Enriched from {lead.latest_enrichment.page_count} company pages
                              {lead.latest_enrichment.emails.length ? ` · ${lead.latest_enrichment.emails.length} email found` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {prospect.website_url && lead.status !== "imported" && (
                            <Button size="sm" variant="outline" disabled={busy || Boolean(lead.active_enrichment_job)} onClick={() => void enrichLead(lead)}>
                              {pendingAction === `enrich:${lead.id}` || lead.active_enrichment_job
                                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                              {lead.active_enrichment_job ? "Enriching" : lead.latest_enrichment ? "Refresh details" : "Enrich company"}
                            </Button>
                          )}
                          {lead.status !== "shortlisted" && lead.status !== "imported" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateLead(lead, "shortlisted")}><Check className="mr-1.5 h-3.5 w-3.5" />Shortlist</Button>
                          )}
                          {lead.status !== "dismissed" && lead.status !== "imported" && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void updateLead(lead, "dismissed")}><X className="mr-1.5 h-3.5 w-3.5" />Dismiss</Button>
                          )}
                          {lead.status === "dismissed" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateLead(lead, "new")}>Restore</Button>
                          )}
                          {lead.status === "imported" ? (
                            <Link href="/crm" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>View CRM</Link>
                          ) : (
                            <Button size="sm" disabled={busy} onClick={() => void promoteLead(lead)}>
                              {pendingAction === `promote:${lead.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                              Add to CRM
                            </Button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Showing {offset + 1}–{Math.min(offset + leads.length, total)} of {total}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" aria-label="Previous lead page" disabled={offset === 0} onClick={() => void loadLeads(Math.max(0, offset - PAGE_SIZE), filter)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" aria-label="Next lead page" disabled={offset + PAGE_SIZE >= total} onClick={() => void loadLeads(offset + PAGE_SIZE, filter)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "campaigns" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Campaigns</h2>
              <p className="text-sm text-zinc-400">Reuse successful searches without entering the criteria again.</p>
            </div>
            <p className="text-xs text-zinc-500">
              Today: {usage.runs_started} searches · {usage.results_returned} leads · {usage.enrichments_started} enrichments · ${Number(usage.reported_cost_usd).toFixed(2)} reported cost
            </p>
          </div>
          {loadingCampaigns ? (
            <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading campaigns" /></div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-400">No campaigns yet. Your first search will be saved automatically.</div>
          ) : (
            <div className="grid gap-3">
              {campaigns.map((campaign) => {
                const job = campaign.latest_job;
                const busy = pendingAction?.endsWith(campaign.id) || campaign.status === "running";
                return (
                  <article key={campaign.id} className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 md:flex-row md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-zinc-100">{campaign.name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-2xs ${statusClass(campaign.status)}`}>{statusLabel(campaign.status)}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {campaign.source === "google_maps" ? "Google Maps" : "Web search"} · Up to {campaign.max_results} results
                        {job?.status === "done" ? ` · ${job.returned_results} found` : ""}
                      </p>
                      {job?.error_message && <p className="mt-1 text-xs text-red-300">{job.error_message}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void runCampaign(campaign)}>
                        {pendingAction === `run:${campaign.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                        Run again
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void archiveCampaign(campaign)}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!loadingCampaigns && campaigns.length < campaignTotal && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void loadCampaigns(campaigns.length, true)}>Load more campaigns</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
