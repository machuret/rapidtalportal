"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  Globe2,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type {
  Competitor,
  CompetitorCrawlJob,
  CompetitorRefreshCadence,
  CompetitorSource,
} from "@/types/competitors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CompetitorsTabProps {
  clientId: string;
  canManage: boolean;
}

const CADENCES: { value: CompetitorRefreshCadence; label: string }[] = [
  { value: "manual", label: "Manual refresh" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const SOURCE_LABELS: Record<CompetitorSource["source_type"], string> = {
  website: "Website",
  blog: "Blog",
  page: "Single page",
  sitemap: "Sitemap",
  rss: "RSS / Atom",
  newsletter_archive: "Newsletter archive",
  youtube: "YouTube",
  social_profile: "Social profile",
  other: "Public URL",
};

const ACTIVE_JOB_STATUSES = new Set(["queued", "crawling", "ingesting"]);

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sourceState(source: CompetitorSource): {
  label: string;
  className: string;
  activeJob: CompetitorCrawlJob | null;
} {
  const activeJob = source.latest_job && ACTIVE_JOB_STATUSES.has(source.latest_job.status)
    ? source.latest_job
    : null;
  if (activeJob) {
    return {
      label: activeJob.status === "ingesting" ? "Saving content" : "Collecting",
      className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
      activeJob,
    };
  }
  if (source.status === "connector_required") {
    return {
      label: "Connector required",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      activeJob: null,
    };
  }
  if (source.status === "error") {
    return {
      label: "Needs attention",
      className: "border-red-500/30 bg-red-500/10 text-red-300",
      activeJob: null,
    };
  }
  if (source.status === "paused") {
    return {
      label: "Paused",
      className: "border-zinc-700 bg-zinc-800 text-zinc-400",
      activeJob: null,
    };
  }
  return {
    label: "Ready",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    activeJob: null,
  };
}

export function CompetitorsTab({ clientId, canManage }: CompetitorsTabProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [addingSourceTo, setAddingSourceTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    website_url: "",
    description: "",
    refresh_cadence: "manual" as CompetitorRefreshCadence,
    max_pages: 30,
  });
  const [sourceForm, setSourceForm] = useState({
    url: "",
    crawl_scope: "auto",
    refresh_cadence: "",
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
        `/content/competitors?client_id=${clientId}`,
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
    if (!canManage || activeJobs.length === 0) return;
    const timer = window.setTimeout(async () => {
      await Promise.allSettled(activeJobs.map((job) =>
        api.post("/content/competitors/crawl/advance", {
          client_id: clientId,
          job_id: job.id,
        }, { showErrorToast: false })));
      await load(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [activeJobs, canManage, clientId, load]);

  async function createCompetitor(event: React.FormEvent) {
    event.preventDefault();
    setWorking("create");
    try {
      await api.post("/content/competitors", {
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

  async function addSource(event: React.FormEvent, competitorId: string) {
    event.preventDefault();
    setWorking(`source:${competitorId}`);
    try {
      await api.post("/content/competitors/sources", {
        client_id: clientId,
        competitor_id: competitorId,
        url: sourceForm.url,
        crawl_scope: sourceForm.crawl_scope,
        refresh_cadence: sourceForm.refresh_cadence || null,
        max_pages: sourceForm.max_pages,
      });
      setSourceForm({ url: "", crawl_scope: "auto", refresh_cadence: "", max_pages: 30 });
      setAddingSourceTo(null);
      toast.success("Source URL added.");
      await load(true);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function refreshSource(source: CompetitorSource) {
    setWorking(`refresh:${source.id}`);
    try {
      await api.post("/content/competitors/crawl", {
        client_id: clientId,
        source_id: source.id,
      });
      toast.success("Content collection started.");
      await load(true);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function toggleSource(source: CompetitorSource) {
    setWorking(`toggle:${source.id}`);
    try {
      await api.patch("/content/competitors/sources", {
        client_id: clientId,
        id: source.id,
        status: source.status === "active" ? "paused" : "active",
      });
      await load(true);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function removeSource(source: CompetitorSource) {
    if (!window.confirm("Delete this source and all content captured from it? This cannot be undone.")) return;
    setWorking(`delete-source:${source.id}`);
    try {
      await api.delete("/content/competitors/sources", {
        client_id: clientId,
        id: source.id,
      });
      toast.success("Source and captured content deleted.");
      await load(true);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function toggleCompetitor(competitor: Competitor) {
    setWorking(`toggle-competitor:${competitor.id}`);
    try {
      await api.patch("/content/competitors", {
        client_id: clientId,
        id: competitor.id,
        status: competitor.status === "paused" ? "active" : "paused",
      });
      await load(true);
    } catch (caught) {
      reportActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function removeCompetitor(competitor: Competitor) {
    if (!window.confirm(`Delete ${competitor.name} and every captured source? This cannot be undone.`)) return;
    setWorking(`delete-competitor:${competitor.id}`);
    try {
      await api.delete("/content/competitors", {
        client_id: clientId,
        id: competitor.id,
      });
      toast.success("Competitor and captured content deleted.");
      await load(true);
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
            Collect public market content for topic and format analysis. Competitor material stays separate from your Vault and cannot support claims.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            size="sm"
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
          <p className="mt-1 text-sm text-zinc-500">Add a website, blog, sitemap, feed or individual public URL to begin.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.map((competitor) => (
            <section key={competitor.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="flex flex-col gap-3 border-b border-zinc-800 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">{competitor.name}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${
                      competitor.status === "active"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-700 bg-zinc-800 text-zinc-400"
                    }`}>
                      {competitor.status === "active" ? "Active" : "Paused"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {CADENCES.find((entry) => entry.value === competitor.refresh_cadence)?.label}
                    </span>
                  </div>
                  {competitor.description && <p className="mt-1 text-sm text-zinc-400">{competitor.description}</p>}
                  <p className="mt-2 text-xs text-zinc-500">
                    {competitor.sources.length} source{competitor.sources.length === 1 ? "" : "s"} ·{" "}
                    {competitor.sources.reduce((total, source) => total + source.content_count, 0)} captured item
                    {competitor.sources.reduce((total, source) => total + source.content_count, 0) === 1 ? "" : "s"}
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => void toggleCompetitor(competitor)}>
                      {competitor.status === "paused" ? <Play /> : <Pause />}
                      {competitor.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${competitor.name}`}
                      onClick={() => void removeCompetitor(competitor)}
                      disabled={working === `delete-competitor:${competitor.id}`}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-5">
                {competitor.sources.map((source) => {
                  const state = sourceState(source);
                  const busy = Boolean(state.activeJob);
                  return (
                    <div key={source.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                              {SOURCE_LABELS[source.source_type]}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${state.className}`}>
                              {state.label}
                            </span>
                            <span className="text-xs text-zinc-500">{source.crawl_scope} scope</span>
                          </div>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 flex max-w-3xl items-center gap-1.5 truncate text-sm text-sky-400 hover:text-sky-300"
                          >
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{source.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                            <span>{source.content_count} items</span>
                            <span>Last success: {formatDate(source.last_success_at)}</span>
                            {source.next_refresh_at && <span>Next: {formatDate(source.next_refresh_at)}</span>}
                            {busy && <span>{state.activeJob?.pages_discovered ?? 0} pages discovered</span>}
                          </div>
                          {source.last_error && (
                            <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              {source.last_error}
                            </p>
                          )}
                          {source.status === "connector_required" && (
                            <p className="mt-2 text-xs text-amber-300">
                              The URL is saved. Use an approved platform connector or user-provided export when channel connectors are enabled.
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex shrink-0 flex-wrap items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void refreshSource(source)}
                              disabled={busy || source.status === "paused" || source.status === "connector_required" || working === `refresh:${source.id}`}
                            >
                              {busy || working === `refresh:${source.id}`
                                ? <Loader2 className="animate-spin" />
                                : <RefreshCw />}
                              Refresh
                            </Button>
                            {source.status !== "connector_required" && (
                              <Button type="button" size="icon-sm" variant="ghost" onClick={() => void toggleSource(source)}>
                                {source.status === "active" ? <Pause /> : <Play />}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => void removeSource(source)}
                              className="text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {competitor.sources.length === 0 && (
                  <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
                    No source URLs have been added.
                  </p>
                )}

                {addingSourceTo === competitor.id && canManage ? (
                  <form onSubmit={(event) => void addSource(event, competitor.id)} className="space-y-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_160px_110px]">
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>Public URL</span>
                        <Input
                          required
                          type="url"
                          value={sourceForm.url}
                          onChange={(event) => setSourceForm((form) => ({ ...form, url: event.target.value }))}
                          placeholder="https://competitor.com/blog or /article"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>Collection scope</span>
                        <select
                          value={sourceForm.crawl_scope}
                          onChange={(event) => setSourceForm((form) => ({ ...form, crawl_scope: event.target.value }))}
                          className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200"
                        >
                          <option value="auto">Detect automatically</option>
                          <option value="exact">This page only</option>
                          <option value="path">This section</option>
                          <option value="domain">Whole website</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>Schedule</span>
                        <select
                          value={sourceForm.refresh_cadence}
                          onChange={(event) => setSourceForm((form) => ({ ...form, refresh_cadence: event.target.value }))}
                          className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200"
                        >
                          <option value="">Inherit competitor</option>
                          {CADENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-zinc-400">
                        <span>Page limit</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={sourceForm.max_pages}
                          onChange={(event) => setSourceForm((form) => ({ ...form, max_pages: Number(event.target.value) }))}
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setAddingSourceTo(null)}>Cancel</Button>
                      <Button type="submit" size="sm" disabled={working === `source:${competitor.id}`}>
                        {working === `source:${competitor.id}` && <Loader2 className="animate-spin" />}
                        Add source
                      </Button>
                    </div>
                  </form>
                ) : canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAddingSourceTo(competitor.id)}
                    className="text-orange-400 hover:text-orange-300"
                  >
                    <Plus />
                    Add another URL
                  </Button>
                ) : null}

                {competitor.recent_items.length > 0 && (
                  <div className="border-t border-zinc-800 pt-4">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      Recently captured
                    </h4>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {competitor.recent_items.map((item) => (
                        <a
                          key={item.id}
                          href={item.canonical_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-zinc-800 px-3 py-2 hover:border-zinc-700 hover:bg-zinc-900"
                        >
                          <span className="block truncate text-sm text-zinc-300">{item.title}</span>
                          <span className="mt-0.5 block text-xs text-zinc-600">{formatDate(item.captured_at)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
