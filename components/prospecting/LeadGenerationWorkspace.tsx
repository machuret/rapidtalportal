"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { ROUTES } from "@/lib/api/routes";
import { CampaignManager } from "@/components/prospecting/CampaignManager";
import { LeadSearchForm } from "@/components/prospecting/LeadSearchForm";
import { LeadInbox, type ProspectingFitFilter, type ProspectingLeadSort } from "@/components/prospecting/LeadInbox";
import { ProspectingActivityTimeline } from "@/components/prospecting/ProspectingActivityTimeline";
import { ProspectingLoadFailure } from "@/components/prospecting/ProspectingLoadFailure";
import { ProspectingActiveJob } from "@/components/prospecting/ProspectingActiveJob";
import { reportClientExperience, reportClientFeatureReady } from "@/lib/client-experience";
import { keywordList } from "@/components/prospecting/presentation";
import { discoverySourceCapabilities, type EnabledDiscoverySource } from "@/lib/prospecting/catalog";
import type {
  ProspectingActivityEvent, ProspectingActivityPage, ProspectingCampaign, ProspectingCampaignPage,
  ProspectingCollaborator, ProspectingIdealProfile, ProspectingJob, ProspectingLead,
  ProspectingLeadPage, ProspectingLeadStatus,
} from "@/types/prospecting";
import { ActionOutcome, type ActionOutcomeState } from "@/components/ui/ActionOutcome";
import { ProviderStatusStrip } from "@/components/prospecting/ProviderStatusStrip";
import {
  ProspectingWorkspaceTabs,
  type ProspectingWorkspaceTab,
} from "@/components/prospecting/ProspectingWorkspaceTabs";

type Tab = ProspectingWorkspaceTab;
const TERMINAL = new Set(["done", "error", "cancelled"]);
const PAGE_SIZE = 30;

export function LeadGenerationWorkspace({
  clientId,
  initialLeadId = null,
  initialTab = null,
}: {
  clientId: string;
  initialLeadId?: string | null;
  initialTab?: Extract<Tab, "campaigns"> | null;
}) {
  const [tab, setTab] = useState<Tab>(initialLeadId ? "inbox" : initialTab ?? "find");
  const [campaigns, setCampaigns] = useState<ProspectingCampaign[]>([]);
  const [leads, setLeads] = useState<ProspectingLead[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<ProspectingLeadStatus | "all">("all");
  const [fitFilter, setFitFilter] = useState<ProspectingFitFilter>("all");
  const [leadSort, setLeadSort] = useState<ProspectingLeadSort>("fit");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [campaignLoadError, setCampaignLoadError] = useState<string | null>(null);
  const [leadLoadError, setLeadLoadError] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<ProspectingJob[]>([]);
  const [campaignTotal, setCampaignTotal] = useState(0);
  const [collaborators, setCollaborators] = useState<ProspectingCollaborator[]>([]);
  const [activity, setActivity] = useState<ProspectingActivityEvent[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityLoadError, setActivityLoadError] = useState<string | null>(null);
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
  const [source, setSource] = useState<EnabledDiscoverySource>("google_maps");
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
  const [actionOutcome, setActionOutcome] = useState<ActionOutcomeState | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Record<string, { email: string; phone: string }>>({});
  const pollBusy = useRef(false);
  const pollFailures = useRef(0);
  const startBusy = useRef(false);
  const activeJobsRef = useRef<ProspectingJob[]>([]);
  const reportedFeatureState = useRef<string | null>(null);

  useEffect(() => {
    activeJobsRef.current = activeJobs;
  }, [activeJobs]);

  const loadCampaigns = useCallback(async (nextOffset = 0, append = false, silent = false) => {
    if (!append && !silent) {
      setCampaignLoadError(null);
      setLoadingCampaigns(true);
      reportedFeatureState.current = null;
    }
    try {
      const result = await api.get<ProspectingCampaignPage>(
        ROUTES.prospecting.campaignsForClient(clientId, nextOffset),
        { showErrorToast: false },
      );
      setCampaigns((current) => append ? [...current, ...result.campaigns] : result.campaigns);
      setCampaignLoadError(null);
      setCampaignTotal(result.total);
      setCollaborators(result.collaborators ?? []);
      setUsage(result.usage);
      setActiveJobs((current) => {
        const retained = append ? current : [];
        const byId = new Map(retained.map((job) => [job.id, job]));
        for (const job of result.active_jobs ?? []) byId.set(job.id, job);
        return Array.from(byId.values());
      });
      return result;
    } catch (error) {
      const message = errorMessage(error, "Campaigns could not be loaded.");
      if (!silent) {
        setCampaignLoadError(message);
        toast.error(message);
      }
      return null;
    } finally {
      if (!silent) setLoadingCampaigns(false);
    }
  }, [clientId]);

  const loadActivity = useCallback(async (nextOffset = 0, append = false) => {
    setActivityLoadError(null);
    setLoadingActivity(true);
    try {
      const result = await api.get<ProspectingActivityPage>(
        ROUTES.prospecting.activityForClient(clientId, nextOffset),
        { showErrorToast: false },
      );
      setActivity((current) => append ? [...current, ...result.events] : result.events);
      setActivityLoadError(null);
      setActivityTotal(result.total);
    } catch (error) {
      const message = errorMessage(error, "Lead activity could not be loaded.");
      setActivityLoadError(message);
      toast.error(message);
    } finally {
      setLoadingActivity(false);
    }
  }, [clientId]);

  const loadLeads = useCallback(async (
    nextOffset: number,
    nextFilter: ProspectingLeadStatus | "all",
    nextFit: ProspectingFitFilter,
    nextSort: ProspectingLeadSort,
    nextCampaignId: string | null,
    requestedLeadId: string | null = null,
  ) => {
    setLeadLoadError(null);
    setLoadingLeads(true);
    reportedFeatureState.current = null;
    try {
      const result = await api.get<ProspectingLeadPage>(
        requestedLeadId
          ? ROUTES.prospecting.leadForClient(clientId, requestedLeadId)
          : ROUTES.prospecting.leadsPage(clientId, nextFilter, nextFit, nextSort, nextOffset, PAGE_SIZE, nextCampaignId),
        { showErrorToast: false },
      );
      setLeads(result.leads);
      setLeadLoadError(null);
      setSelectedContacts((current) => {
        const next: typeof current = {};
        for (const lead of result.leads) {
          const selected = current[lead.id];
          if (!selected || !lead.latest_enrichment) continue;
          next[lead.id] = {
            email: lead.latest_enrichment.emails.includes(selected.email) ? selected.email : "",
            phone: lead.latest_enrichment.phones.includes(selected.phone) ? selected.phone : "",
          };
        }
        return next;
      });
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
      return result;
    } catch (error) {
      const message = errorMessage(error, "Lead Inbox could not be loaded.");
      setLeadLoadError(message);
      toast.error(message);
      return null;
    } finally {
      setLoadingLeads(false);
    }
  }, [clientId]);

  useEffect(() => {
    void Promise.all([loadCampaigns(), loadLeads(0, "all", "all", "fit", null, initialLeadId)]);
  }, [initialLeadId, loadCampaigns, loadLeads]);

  useEffect(() => {
    if (loadingCampaigns || loadingLeads) return;
    const state = campaignLoadError || leadLoadError ? "error" : "ready";
    if (reportedFeatureState.current === state) return;
    reportedFeatureState.current = state;
    if (state === "ready") reportClientFeatureReady("/lead-generation", "lead_generation");
    else reportClientExperience({
      eventType: "feature_error",
      path: "/lead-generation",
      metadata: { feature: "lead_generation" },
    });
  }, [campaignLoadError, leadLoadError, loadingCampaigns, loadingLeads]);

  const activeJobKey = activeJobs.map((job) => job.id).sort().join(",");
  useEffect(() => {
    if (!activeJobKey) return;
    const refreshProgress = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        const previousJobs = [...activeJobsRef.current];
        if (previousJobs.length) {
          await api.post(
            ROUTES.prospecting.advance(),
            { clientId, jobIds: previousJobs.slice(0, 8).map((job) => job.id) },
            { showErrorToast: false, idempotent: true, retries: 1 },
          ).catch(() => null);
        }
        const result = await loadCampaigns(0, false, true);
        if (result) {
          pollFailures.current = 0;
          setPollIssue(null);
          const nextIds = new Set((result.active_jobs ?? []).map((job) => job.id));
          const finished = previousJobs.filter((job) => !nextIds.has(job.id));
          if (finished.length) {
            const leadPage = await loadLeads(offset, filter, fitFilter, leadSort, campaignFilter);
            for (const job of finished) {
              if (job.job_type === "enrichment") {
                const finalJob = leadPage?.leads.find((lead) => lead.latest_enrichment_job?.id === job.id)?.latest_enrichment_job;
                if (finalJob?.status === "done") toast.success("Company enrichment finished. The new details are ready to review.");
                else if (finalJob?.status === "error") toast.error(finalJob.error_message || "Company enrichment failed. Open the lead to see what happened and try again.");
                else if (finalJob?.status === "cancelled") toast.info("Company enrichment was cancelled.");
              } else {
                const finalJob = result.campaigns.find((campaign) => campaign.latest_job?.id === job.id)?.latest_job;
                if (finalJob?.status === "done") toast.success(`Lead collection finished with ${finalJob.returned_results} usable ${finalJob.returned_results === 1 ? "lead" : "leads"}.`);
                else if (finalJob?.status === "error") toast.error(finalJob.error_message || "Lead collection failed. Open Campaigns to retry it.");
                else if (finalJob?.status === "cancelled") toast.info("Lead collection was cancelled.");
              }
            }
          }
        } else {
          pollFailures.current += 1;
          if (!navigator.onLine) setPollIssue("You are offline. Collection is continuing in the background.");
          else if (pollFailures.current >= 3) setPollIssue("Some collection progress cannot be refreshed right now. Background recovery is still running.");
        }
      } catch {
        pollFailures.current += 1;
        if (!navigator.onLine) setPollIssue("You are offline. Collection is continuing in the background.");
        else if (pollFailures.current >= 3) setPollIssue("Progress cannot be refreshed right now. Background recovery is still running.");
      } finally {
        pollBusy.current = false;
      }
    };
    void refreshProgress();
    const timer = window.setInterval(() => void refreshProgress(), 10_000);
    return () => window.clearInterval(timer);
  }, [activeJobKey, campaignFilter, clientId, filter, fitFilter, leadSort, loadCampaigns, loadLeads, offset]);

  async function createAndRun() {
    if (startBusy.current) return;
    if (query.trim().length < 2 || location.trim().length < 2) {
      toast.error("Add what you are looking for and where to search.");
      return;
    }
    const normalizeSearchPart = (value: string) => value.trim().replace(/\s+/gu, " ").toLowerCase();
    const existing = campaigns.find((campaign) => (
      campaign.source === source
      && campaign.queries.length === 1
      && normalizeSearchPart(campaign.queries[0] ?? "") === normalizeSearchPart(query)
      && campaign.locations.length === 1
      && normalizeSearchPart(campaign.locations[0] ?? "") === normalizeSearchPart(location)
    ));
    if (existing) {
      setTab("campaigns");
      toast.info(`“${existing.name}” already contains this search. Choose Run again to refresh it${maxResults > existing.max_results ? ", then increase its result limit if needed" : ""}.`);
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
      }, { showErrorToast: false });
      const started = await api.post<{ job: ProspectingJob }>(ROUTES.prospecting.runs(), {
        clientId,
        campaignId: created.campaign.id,
      }, { showErrorToast: false });
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
      }, { showErrorToast: false });
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
      await api.patch(ROUTES.prospecting.campaigns(), { clientId, id: campaign.id, archived: true }, { showErrorToast: false });
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      setCampaignTotal((current) => Math.max(0, current - 1));
      toast.success("Campaign archived.");
    } catch (error) {
      toast.error(errorMessage(error, "Campaign could not be archived."));
    } finally {
      setPendingAction(null);
    }
  }

  async function updateCampaignProfile(campaign: ProspectingCampaign, idealProfile: ProspectingIdealProfile) {
    setPendingAction(`profile:${campaign.id}`);
    try {
      const result = await api.patch<{ campaign: ProspectingCampaign }>(ROUTES.prospecting.campaigns(), {
        clientId,
        id: campaign.id,
        idealProfile,
      }, { showErrorToast: false });
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? result.campaign : item));
      toast.success("Matching rules saved and existing leads rescored.");
      await loadLeads(0, filter, fitFilter, leadSort, campaignFilter);
    } catch (error) {
      toast.error(errorMessage(error, "Matching rules could not be saved."));
    } finally {
      setPendingAction(null);
    }
  }

  async function updateLead(lead: ProspectingLead, status: "new" | "shortlisted" | "dismissed") {
    setPendingAction(`${status}:${lead.id}`);
    try {
      await api.patch(ROUTES.prospecting.leads(), { clientId, id: lead.id, status }, { showErrorToast: false });
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

  async function assignLead(lead: ProspectingLead, assignedTo: string | null) {
    setPendingAction(`assign:${lead.id}`);
    try {
      const result = await api.patch<{ lead: ProspectingLead }>(ROUTES.prospecting.leads(), {
        clientId, id: lead.id, assignedTo,
      }, { showErrorToast: false });
      setLeads((current) => current.map((item) => item.id === lead.id
        ? { ...item, assigned_to: result.lead.assigned_to }
        : item));
      toast.success(assignedTo ? "Lead assigned." : "Lead unassigned.");
    } catch (error) {
      toast.error(errorMessage(error, "Lead assignment could not be saved."));
    } finally {
      setPendingAction(null);
    }
  }

  async function assignCampaign(campaign: ProspectingCampaign, ownerId: string | null) {
    setPendingAction(`owner:${campaign.id}`);
    try {
      const result = await api.patch<{ campaign: ProspectingCampaign }>(ROUTES.prospecting.campaigns(), {
        clientId, id: campaign.id, ownerId,
      }, { showErrorToast: false });
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? result.campaign : item));
      toast.success(ownerId ? "Campaign owner updated." : "Campaign owner removed.");
    } catch (error) {
      toast.error(errorMessage(error, "Campaign owner could not be saved."));
    } finally {
      setPendingAction(null);
    }
  }

  async function promoteLead(lead: ProspectingLead) {
    setPendingAction(`promote:${lead.id}`);
    try {
      const selected = selectedContacts[lead.id];
      const promoted = await api.post<{ contactId: string }>(ROUTES.prospecting.promote(), {
        clientId,
        leadId: lead.id,
        selectedEmail: selected?.email || null,
        selectedPhone: selected?.phone || null,
      }, { showErrorToast: false });
      if (filter !== "all" && filter !== "imported") {
        setLeads((current) => current.filter((item) => item.id !== lead.id));
        setTotal((current) => Math.max(0, current - 1));
      } else {
        setLeads((current) => current.map((item) => item.id === lead.id
          ? { ...item, status: "imported", crm_contact_id: promoted.contactId }
          : item));
      }
      toast.success("Lead added to CRM.");
      setActionOutcome({
        title: "Lead added to CRM",
        message: "The exact contact is ready for review and follow-up.",
        actionLabel: "Open CRM contact",
        href: `/crm?contact=${encodeURIComponent(promoted.contactId)}`,
      });
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
      }, { showErrorToast: false });
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
      }, { showErrorToast: false });
      if (TERMINAL.has(result.job.status)) {
        setActiveJobs((current) => current.filter((item) => item.id !== job.id));
        await Promise.all([loadCampaigns(), loadLeads(offset, filter, fitFilter, leadSort, campaignFilter)]);
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
      {actionOutcome && <ActionOutcome outcome={actionOutcome} onDismiss={() => setActionOutcome(null)} />}
      <ProviderStatusStrip clientId={clientId} />
      <ProspectingWorkspaceTabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          if (value === "activity") void loadActivity();
        }}
      />

      {activeJobs.map((activeJob) => (
        <ProspectingActiveJob key={activeJob.id} job={activeJob} cancelling={pendingAction === `cancel:${activeJob.id}`} onCancel={() => void cancelJob(activeJob)} />
      ))}
      {pollIssue && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" role="alert">{pollIssue}</p>}
      {tab === "find" && (campaignLoadError || leadLoadError) && (
        <ProspectingLoadFailure compact title="Saved campaigns or leads could not be loaded. You can still start a new search." retryLabel="Retry saved data" onRetry={() => void Promise.all([loadCampaigns(), loadLeads(0, filter, fitFilter, leadSort, campaignFilter)])} />
      )}

      {tab === "find" && (
        <LeadSearchForm
          query={query}
          location={location}
          source={source}
          maxResults={maxResults}
          starting={starting}
          showMatching={showMatching}
          requiredKeywords={requiredKeywords}
          preferredKeywords={preferredKeywords}
          excludedKeywords={excludedKeywords}
          minRating={minRating}
          minReviewCount={minReviewCount}
          mustHaveWebsite={mustHaveWebsite}
          onQuery={setQuery}
          onLocation={setLocation}
          onSource={(nextSource) => {
            setSource(nextSource);
            if (!discoverySourceCapabilities(nextSource).supportsRatings) {
              setMinRating(0);
              setMinReviewCount(0);
            }
          }}
          onMaxResults={setMaxResults}
          onToggleMatching={() => setShowMatching((value) => !value)}
          onRequiredKeywords={setRequiredKeywords}
          onPreferredKeywords={setPreferredKeywords}
          onExcludedKeywords={setExcludedKeywords}
          onMinRating={setMinRating}
          onMinReviewCount={setMinReviewCount}
          onMustHaveWebsite={setMustHaveWebsite}
          onSubmit={() => void createAndRun()}
        />
      )}

      {tab === "inbox" && (
        <LeadInbox
          leads={leads}
          total={total}
          offset={offset}
          pageSize={PAGE_SIZE}
          loading={loadingLeads}
          error={leadLoadError}
          filter={filter}
          fitFilter={fitFilter}
          sort={leadSort}
          campaigns={campaigns}
          campaignId={campaignFilter}
          collaborators={collaborators}
          pendingAction={pendingAction}
          selectedContacts={selectedContacts}
          onFilter={(next) => {
            setFilter(next);
            void loadLeads(0, next, fitFilter, leadSort, campaignFilter);
          }}
          onFitFilter={(next) => {
            setFitFilter(next);
            void loadLeads(0, filter, next, leadSort, campaignFilter);
          }}
          onSort={(next) => {
            setLeadSort(next);
            void loadLeads(0, filter, fitFilter, next, campaignFilter);
          }}
          onCampaign={(next) => {
            setCampaignFilter(next);
            void loadLeads(0, filter, fitFilter, leadSort, next);
          }}
          onFindLeads={() => setTab("find")}
          onRetry={() => void loadLeads(offset, filter, fitFilter, leadSort, campaignFilter)}
          onPage={(nextOffset) => void loadLeads(nextOffset, filter, fitFilter, leadSort, campaignFilter)}
          onSelectEmail={(leadId, email) => setSelectedContacts((current) => ({
            ...current,
            [leadId]: { email, phone: current[leadId]?.phone ?? "" },
          }))}
          onSelectPhone={(leadId, phone) => setSelectedContacts((current) => ({
            ...current,
            [leadId]: { email: current[leadId]?.email ?? "", phone },
          }))}
          onAssign={(lead, assignee) => void assignLead(lead, assignee)}
          onEnrich={(lead) => void enrichLead(lead)}
          onStatus={(lead, status) => void updateLead(lead, status)}
          onPromote={(lead) => void promoteLead(lead)}
        />
      )}
      {tab === "campaigns" && (
        <CampaignManager
          campaigns={campaigns}
          total={campaignTotal}
          usage={usage}
          collaborators={collaborators}
          loading={loadingCampaigns}
          error={campaignLoadError}
          pendingAction={pendingAction}
          onRun={(campaign) => void runCampaign(campaign)}
          onArchive={(campaign) => void archiveCampaign(campaign)}
          onAssign={(campaign, ownerId) => void assignCampaign(campaign, ownerId)}
          onUpdateProfile={updateCampaignProfile}
          onViewLeads={(campaign) => {
            setCampaignFilter(campaign.id);
            setTab("inbox");
            void loadLeads(0, filter, fitFilter, leadSort, campaign.id);
          }}
          onLoadMore={() => void loadCampaigns(campaigns.length, true)}
          onRetry={() => void loadCampaigns()}
        />
      )}

      {tab === "activity" && (
        activityLoadError ? (
          <ProspectingLoadFailure title="Lead activity could not be loaded" message={activityLoadError} onRetry={() => void loadActivity(0)} />
        ) : (
          <ProspectingActivityTimeline
            events={activity}
            total={activityTotal}
            loading={loadingActivity}
            onLoadMore={() => void loadActivity(activity.length, true)}
          />
        )
      )}
    </div>
  );
}
