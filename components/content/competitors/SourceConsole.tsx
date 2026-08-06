"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type {
  Competitor,
  CompetitorRefreshCadence,
  CompetitorSource,
} from "@/types/competitors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldTip } from "@/components/ui/tooltip";
import { CaptureBrowser, type CaptureBrowserState } from "./CaptureBrowser";
import { CADENCES, SOURCE_LABELS, formatCompact, formatDate, sourceState } from "./utils";

interface SourceConsoleProps {
  clientId: string;
  canManage: boolean;
  competitor: Competitor;
  /** Reload the competitor list after a mutation (quiet refresh). */
  onChanged: () => Promise<void>;
  /** Route an action failure to the shell-level error banner + toast. */
  onActionError: (caught: unknown) => void;
  captureBrowser: CaptureBrowserState | null;
  onBrowseCaptures: (page?: number) => void;
  onInspectCapture: (itemId: string) => void;
  onCloseCaptures: () => void;
  defaultExpanded?: boolean;
}

/** One competitor card: readiness chips, sources, crawl actions and captured content. */
export function SourceConsole({
  clientId,
  canManage,
  competitor,
  onChanged,
  onActionError,
  captureBrowser,
  onBrowseCaptures,
  onInspectCapture,
  onCloseCaptures,
  defaultExpanded = false,
}: SourceConsoleProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [working, setWorking] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [sourceSettings, setSourceSettings] = useState({
    refresh_cadence: "" as "" | CompetitorRefreshCadence,
    max_pages: 30,
  });
  const [sourceForm, setSourceForm] = useState({
    url: "",
    crawl_scope: "auto",
    refresh_cadence: "",
    max_pages: 30,
  });

  useEffect(() => {
    function revealLinkedCompetitor() {
      if (window.location.hash === `#competitor-${competitor.id}`) setExpanded(true);
    }
    revealLinkedCompetitor();
    window.addEventListener("hashchange", revealLinkedCompetitor);
    return () => window.removeEventListener("hashchange", revealLinkedCompetitor);
  }, [competitor.id]);

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    setWorking(`source:${competitor.id}`);
    try {
      await api.post(ROUTES.content.competitorSources(), {
        client_id: clientId,
        competitor_id: competitor.id,
        url: sourceForm.url,
        crawl_scope: sourceForm.crawl_scope,
        refresh_cadence: sourceForm.refresh_cadence || null,
        max_pages: sourceForm.max_pages,
      }, { showErrorToast: false });
      setSourceForm({ url: "", crawl_scope: "auto", refresh_cadence: "", max_pages: 30 });
      setAddingSource(false);
      toast.success("Source URL added.");
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function refreshSource(source: CompetitorSource) {
    setWorking(`refresh:${source.id}`);
    try {
      await api.post(ROUTES.content.competitorCrawl(), {
        client_id: clientId,
        source_id: source.id,
      }, { showErrorToast: false });
      toast.success("Content collection started.");
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function toggleSource(source: CompetitorSource) {
    setWorking(`toggle:${source.id}`);
    try {
      await api.patch(ROUTES.content.competitorSources(), {
        client_id: clientId,
        id: source.id,
        status: source.status === "paused" ? "active" : "paused",
      }, { showErrorToast: false });
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  function beginSourceSettings(source: CompetitorSource) {
    setEditingSource(source.id);
    setSourceSettings({
      refresh_cadence: source.refresh_cadence ?? "",
      max_pages: source.max_pages,
    });
  }

  async function saveSourceSettings(source: CompetitorSource) {
    setWorking(`settings:${source.id}`);
    try {
      await api.patch(ROUTES.content.competitorSources(), {
        client_id: clientId,
        id: source.id,
        refresh_cadence: sourceSettings.refresh_cadence || null,
        max_pages: sourceSettings.max_pages,
      }, { showErrorToast: false });
      setEditingSource(null);
      toast.success("Source settings updated.");
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function updateCompetitorCadence(refreshCadence: CompetitorRefreshCadence) {
    setWorking(`cadence:${competitor.id}`);
    try {
      await api.patch(ROUTES.content.competitors(), {
        client_id: clientId,
        id: competitor.id,
        refresh_cadence: refreshCadence,
      }, { showErrorToast: false });
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function removeSource(source: CompetitorSource) {
    if (!window.confirm("Delete this source and all content captured from it? This cannot be undone.")) return;
    setWorking(`delete-source:${source.id}`);
    try {
      await api.delete(ROUTES.content.competitorSources(), {
        client_id: clientId,
        id: source.id,
      }, { showErrorToast: false });
      toast.success("Source and captured content deleted.");
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function toggleCompetitor() {
    setWorking(`toggle-competitor:${competitor.id}`);
    try {
      await api.patch(ROUTES.content.competitors(), {
        client_id: clientId,
        id: competitor.id,
        status: competitor.status === "paused" ? "active" : "paused",
      }, { showErrorToast: false });
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function removeCompetitor() {
    if (!window.confirm(`Delete ${competitor.name} and every captured source? This cannot be undone.`)) return;
    setWorking(`delete-competitor:${competitor.id}`);
    try {
      await api.delete(ROUTES.content.competitors(), {
        client_id: clientId,
        id: competitor.id,
      }, { showErrorToast: false });
      toast.success("Competitor and captured content deleted.");
      await onChanged();
    } catch (caught) {
      onActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  return (
    <section
      id={`competitor-${competitor.id}`}
      className="scroll-mt-24 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
    >
      <div className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between ${expanded ? "border-b border-zinc-800" : ""}`}>
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
            {canManage ? (
              <select
                aria-label={`Refresh schedule for ${competitor.name}`}
                value={competitor.refresh_cadence}
                disabled={working === `cadence:${competitor.id}`}
                onChange={(event) => void updateCompetitorCadence(
                  event.target.value as CompetitorRefreshCadence,
                )}
                className="h-7 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300"
              >
                {CADENCES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-zinc-500">
                {CADENCES.find((entry) => entry.value === competitor.refresh_cadence)?.label}
              </span>
            )}
          </div>
          {competitor.description && <p className="mt-1 text-sm text-zinc-400">{competitor.description}</p>}
          <p className="mt-2 text-xs text-zinc-500">
            {competitor.sources.length} source{competitor.sources.length === 1 ? "" : "s"} ·{" "}
            {competitor.sources.reduce((total, source) => total + source.content_count, 0)} captured item
            {competitor.sources.reduce((total, source) => total + source.content_count, 0) === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canManage && (
            <>
            <Button type="button" size="sm" variant="ghost" onClick={() => void toggleCompetitor()}>
              {competitor.status === "paused" ? <Play /> : <Pause />}
              {competitor.status === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${competitor.name}`}
              onClick={() => void removeCompetitor()}
              disabled={working === `delete-competitor:${competitor.id}`}
              className="text-zinc-500 hover:text-red-400"
            >
              <Trash2 />
            </Button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            aria-controls={`competitor-details-${competitor.id}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide details" : canManage ? "Manage sources" : "View sources"}
            <ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {expanded && <div id={`competitor-details-${competitor.id}`} className="space-y-3 p-5">
        <div className={`rounded-lg border p-4 ${
          competitor.readiness.positioning_ready
            ? "border-emerald-500/25 bg-emerald-500/5"
            : "border-amber-500/25 bg-amber-500/5"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Mini Vault: {competitor.readiness.content_strategy_ready
                  ? "Ready for content intelligence"
                  : competitor.readiness.positioning_ready
                    ? "Ready for positioning analysis"
                    : "Building evidence"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {competitor.readiness.captured_items} items ·{" "}
                {formatCompact(competitor.readiness.content_characters)} characters ·{" "}
                {competitor.readiness.article_count} articles ·{" "}
                {competitor.readiness.social_post_count} social posts
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 px-2.5 py-1 text-emerald-300">
                {competitor.readiness.positioning_readiness_score}/100 positioning
                <FieldTip text="Positioning readiness: enough captured content (5+ items, 3,000+ characters) for the engine to map this competitor's market position against yours. Higher = more evidence." />
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                competitor.readiness.content_strategy_ready
                  ? "border-emerald-500/30 text-emerald-300"
                  : "border-amber-500/30 text-amber-300"
              }`}>
                {competitor.readiness.editorial_readiness_score}/100 editorial
                <FieldTip text="Editorial readiness: how much article and social content has been captured for content-strategy analysis — topics, formats and cadence. Amber means collect more sources." />
              </span>
            </div>
          </div>
          {!competitor.readiness.positioning_ready && (
            <p className="mt-2 text-xs text-amber-200/80">
              Collect at least 5 recent items and 3,000 characters. Add the company website,
              blog, RSS feed, exact article URLs or its public LinkedIn company page, then refresh each source.
            </p>
          )}
          {competitor.readiness.limitations.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-200/80">
              {competitor.readiness.limitations.slice(0, 3).map((limitation) => (
                <li key={limitation}>• {limitation}</li>
              ))}
            </ul>
          )}
          {competitor.identity_warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs leading-5 text-red-200">
              <p className="font-medium">Possible competitor identity mismatch</p>
              {competitor.identity_warnings.map((warning) => (
                <p key={warning} className="mt-1">{warning}</p>
              ))}
            </div>
          )}
        </div>
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
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={source.status === "paused" ? "Resume source" : "Pause source"}
                        onClick={() => void toggleSource(source)}
                      >
                        {source.status === "paused" ? <Play /> : <Pause />}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Edit source settings"
                      onClick={() => beginSourceSettings(source)}
                    >
                      <Settings2 />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete source"
                      onClick={() => void removeSource(source)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
              {editingSource === source.id && (
                <div className="mt-3 grid gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
                  <label className="space-y-1 text-xs text-zinc-400">
                    <span>Schedule</span>
                    <select
                      value={sourceSettings.refresh_cadence}
                      onChange={(event) => setSourceSettings((settings) => ({
                        ...settings,
                        refresh_cadence: event.target.value as "" | CompetitorRefreshCadence,
                      }))}
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
                      value={sourceSettings.max_pages}
                      onChange={(event) => setSourceSettings((settings) => ({
                        ...settings,
                        max_pages: Number(event.target.value),
                      }))}
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingSource(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={working === `settings:${source.id}`}
                      onClick={() => void saveSourceSettings(source)}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {competitor.sources.length === 0 && (
          <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
            No source URLs have been added.
          </p>
        )}

        {addingSource && canManage ? (
          <form onSubmit={(event) => void addSource(event)} className="space-y-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
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
            <p className="text-xs text-zinc-500">
              Supported now: websites, blog sections, RSS/Atom feeds, sitemaps, exact article URLs,
              and public LinkedIn company pages such as linkedin.com/company/company-name. Whole-site
              and section crawls must match this competitor&apos;s website; use “This page only” for an external article.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddingSource(false)}>Cancel</Button>
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
            onClick={() => setAddingSource(true)}
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 text-orange-400"
              onClick={() => onBrowseCaptures()}
            >
              <FileText />
              Browse all captured content
            </Button>
          </div>
        )}
        {competitor.recent_items.length === 0
          && competitor.sources.some((source) => source.content_count > 0) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-orange-400"
            onClick={() => onBrowseCaptures()}
          >
            <FileText />
            Browse all captured content
          </Button>
        )}

        {captureBrowser && (
          <CaptureBrowser
            browser={captureBrowser}
            onBrowse={(page) => onBrowseCaptures(page)}
            onInspect={onInspectCapture}
            onClose={onCloseCaptures}
          />
        )}
      </div>}
    </section>
  );
}
