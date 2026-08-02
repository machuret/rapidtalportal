"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Globe2,
  Loader2,
  Plus,
  Radar,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type {
  CompetitorIntelligenceIdea,
  CompetitorIntelligenceRun,
} from "@/lib/competitors/intelligence";
import type {
  Competitor,
  CompetitorContentItem,
  CompetitorCrawlJob,
  CompetitorRefreshCadence,
} from "@/types/competitors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompetitorIntelligencePanel } from "./intelligence/CompetitorIntelligencePanel";
import { SourceConsole } from "./SourceConsole";
import type { CaptureBrowserState } from "./CaptureBrowser";
import { CADENCES, sourceState } from "./utils";

interface CompetitorsTabProps {
  clientId: string;
  canManage: boolean;
  active?: boolean;
  /** Set false where only the management console is wanted (e.g. DNA › Competitors). */
  showIntelligence?: boolean;
  onIdeaSelected?: (
    idea: CompetitorIntelligenceIdea,
    run: CompetitorIntelligenceRun,
  ) => void;
}

export function CompetitorsTab({
  clientId,
  canManage,
  active = true,
  showIntelligence = true,
  onIdeaSelected,
}: CompetitorsTabProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [captureBrowser, setCaptureBrowser] = useState<CaptureBrowserState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    website_url: "",
    description: "",
    refresh_cadence: "manual" as CompetitorRefreshCadence,
    max_pages: 30,
  });

  const reportActionError = useCallback((caught: unknown) => {
    const message = caught instanceof Error ? caught.message : "The competitor action failed.";
    setError(message);
    toast.error(message);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api.get<{ competitors: Competitor[] }>(
        ROUTES.content.competitorsForClient(clientId),
        { showErrorToast: !quiet },
      );
      setCompetitors(result.competitors);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load competitors.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeJobs = useMemo(
    () => competitors.flatMap((competitor) =>
      competitor.sources
        .map((source) => sourceState(source).activeJob)
        .filter((job): job is CompetitorCrawlJob => Boolean(job))),
    [competitors],
  );

  useEffect(() => {
    if (!active || !canManage || activeJobs.length === 0) return;
    const timer = window.setTimeout(async () => {
      await Promise.allSettled(activeJobs.map((job) =>
        api.post(ROUTES.content.competitorCrawlAdvance(), {
          client_id: clientId,
          job_id: job.id,
        }, { showErrorToast: false })));
      await load(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [active, activeJobs, canManage, clientId, load]);

  async function createCompetitor(event: React.FormEvent) {
    event.preventDefault();
    setWorking("create");
    try {
      await api.post(ROUTES.content.competitors(), {
        client_id: clientId,
        ...createForm,
      });
      setCreateForm({
        name: "",
        website_url: "",
        description: "",
        refresh_cadence: "manual",
        max_pages: 30,
      });
      setShowCreate(false);
      toast.success("Competitor added.");
      await load(true);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function browseCaptures(competitorId: string, page = 0) {
    setCaptureBrowser((current) => ({
      competitorId,
      items: current?.competitorId === competitorId ? current.items : [],
      page,
      total: current?.competitorId === competitorId ? current.total : 0,
      hasMore: false,
      selected: null,
      loading: true,
    }));
    try {
      const result = await api.get<{
        items: CompetitorContentItem[];
        page: number;
        total: number;
        has_more: boolean;
      }>(ROUTES.content.competitorItemsPage(clientId, competitorId, page, 20));
      setCaptureBrowser({
        competitorId,
        items: result.items,
        page: result.page,
        total: result.total,
        hasMore: result.has_more,
        selected: null,
        loading: false,
      });
    } catch (caught) {
      setCaptureBrowser(null);
      reportActionError(caught);
    }
  }

  async function inspectCapture(competitorId: string, itemId: string) {
    setWorking(`capture:${itemId}`);
    try {
      const result = await api.get<{ item: CompetitorContentItem }>(
        ROUTES.content.competitorItem(clientId, competitorId, itemId),
      );
      setCaptureBrowser((current) => current ? { ...current, selected: result.item } : current);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading competitor sources…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-orange-400" />
            <h2 className="font-semibold text-white">Competitor intelligence</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Collect public market content for topic and format analysis. It stays in a protected market-context area and cannot become Company DNA, company facts or writing-style authority.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            size="sm"
            data-testid="competitor-add-button"
            onClick={() => setShowCreate((value) => !value)}
            className="bg-orange-500 text-white hover:bg-orange-400"
          >
            {showCreate ? <X /> : <Plus />}
            {showCreate ? "Close" : "Add competitor"}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {competitors.length > 0 && showIntelligence && (
        <CompetitorIntelligencePanel
          clientId={clientId}
          canManage={canManage}
          competitors={competitors}
          onIdeaSelected={onIdeaSelected}
        />
      )}

      {showCreate && canManage && (
        <form onSubmit={createCompetitor} className="space-y-4 rounded-xl border border-orange-500/30 bg-zinc-900 p-5">
          <div>
            <h3 className="font-semibold text-white">Add a competitor</h3>
            <p className="mt-1 text-xs text-zinc-500">Adding a website URL also creates the first collection source.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-zinc-300">
              <span>Name</span>
              <Input
                required
                maxLength={160}
                value={createForm.name}
                onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="Competitor name"
              />
            </label>
            <label className="space-y-1.5 text-sm text-zinc-300">
              <span>Website URL</span>
              <Input
                type="url"
                value={createForm.website_url}
                onChange={(event) => setCreateForm((form) => ({ ...form, website_url: event.target.value }))}
                placeholder="https://competitor.com"
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>Notes</span>
            <Textarea
              maxLength={2000}
              value={createForm.description}
              onChange={(event) => setCreateForm((form) => ({ ...form, description: event.target.value }))}
              placeholder="Why this competitor matters, market segment, location…"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-zinc-300">
              <span>Refresh schedule</span>
              <select
                value={createForm.refresh_cadence}
                onChange={(event) => setCreateForm((form) => ({
                  ...form,
                  refresh_cadence: event.target.value as CompetitorRefreshCadence,
                }))}
                className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-200"
              >
                {CADENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm text-zinc-300">
              <span>Maximum pages per refresh</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={createForm.max_pages}
                onChange={(event) => setCreateForm((form) => ({
                  ...form,
                  max_pages: Number(event.target.value),
                }))}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={working === "create"}>
              {working === "create" && <Loader2 className="animate-spin" />}
              Add competitor
            </Button>
          </div>
        </form>
      )}

      {competitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 px-6 py-12 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 font-medium text-zinc-300">No competitors added yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            {canManage
              ? "Add a website, blog, sitemap, feed or individual public URL to begin."
              : "Ask your client admin to add competitor websites and public channels."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((competitor) => (
            <SourceConsole
              key={competitor.id}
              clientId={clientId}
              canManage={canManage}
              competitor={competitor}
              onChanged={() => load(true)}
              onActionError={reportActionError}
              captureBrowser={captureBrowser?.competitorId === competitor.id ? captureBrowser : null}
              onBrowseCaptures={(page) => void browseCaptures(competitor.id, page)}
              onInspectCapture={(itemId) => void inspectCapture(competitor.id, itemId)}
              onCloseCaptures={() => setCaptureBrowser(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
