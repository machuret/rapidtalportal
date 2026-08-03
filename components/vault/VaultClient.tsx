"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { DbVaultItem, VaultCategory } from "@/types/database";
import { toast } from "sonner";
import {
  FileText, Trash2, Search, Loader2, CheckSquare, Square, X, Radar,
  AlertTriangle, RefreshCw, Sparkles,
  ArrowRight, CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { VaultItemDrawer } from "./VaultItemDrawer";
import { AddVaultItem } from "./AddVaultItem";
import { CrawlJobPanel, type CrawlJob } from "./CrawlJobPanel";
import { VaultRecap } from "./VaultRecap";
import { VaultExpanded } from "./VaultExpanded";
import { VaultItemRow } from "./VaultItemRow";
import { useVaultList } from "@/hooks/useVaultList";
import { VAULT_CATEGORIES, VAULT_CATEGORY_KEYS } from "@/lib/taxonomy/vault-categories";
import { CompetitorsTab } from "@/components/content/competitors/CompetitorsTab";
import { VaultReadinessDashboard } from "./VaultReadinessDashboard";
import { reportClientExperience, reportClientFeatureReady } from "@/lib/client-experience";
import type { ClientFirstSuccessProgress } from "@/lib/onboarding/client-first-success";

type TypeFilter = "all" | "text" | "url" | "pdf" | "docx";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "text", label: "Text" },
  { value: "url", label: "URL" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "DOCX" },
];

const CATEGORY_FILTERS: { value: VaultCategory | "all"; label: string }[] = [
  { value: "all", label: "All Categories" },
  ...VAULT_CATEGORY_KEYS.map((k) => ({ value: k, label: VAULT_CATEGORIES[k].shortLabel })),
];

interface VaultClientProps {
  clientId: string;
  userId: string;
  role: string;
  canWrite: boolean; // role-gated by the server page; client Vault also permits VA contribution
  companyWebsite?: string | null;
  title?: string;
  subtitle?: string;
  focusMode?: "documents" | null;
  initialSearch?: string;
  initialOpenItemId?: string | null;
}

// The portal layout provides a global QueryClientProvider, so this just renders.
export function VaultClient(props: VaultClientProps) {
  return <VaultClientInner {...props} />;
}

function VaultClientInner({
  clientId, userId, role, canWrite,
  companyWebsite = null,
  title = "Company Knowledge",
  subtitle = "Approved company facts used by RapidTal Coach and content generation.",
  focusMode = null,
  initialSearch = "",
  initialOpenItemId = null,
}: VaultClientProps) {
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<VaultCategory | "all">("all");

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const {
    items,
    counts,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error: vaultLoadError,
    isError: vaultLoadFailed,
    deleteItems,
    isDeleting: bulkDeleting,
    reprocessItem,
  } = useVaultList(clientId, {
    q: debouncedSearch,
    category: categoryFilter,
    type: typeFilter,
    evidenceRole: "factual",
  });
  const reportedReadiness = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const state = vaultLoadFailed ? "error" : "ready";
    if (reportedReadiness.current === state) return;
    reportedReadiness.current = state;
    if (state === "ready") reportClientFeatureReady("/vault", "vault_items");
    else reportClientExperience({ eventType: "feature_error", path: "/vault", metadata: { feature: "vault_items" } });
  }, [isLoading, vaultLoadFailed]);

  const [expanded, setExpanded] = useState<string | null>(initialOpenItemId);
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null);
  const [view, setView] = useState<"items" | "recap" | "expanded" | "competitors">("items");
  const [editItem, setEditItem] = useState<DbVaultItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [startingWebsiteCrawl, setStartingWebsiteCrawl] = useState(false);

  const hasFilters = debouncedSearch !== "" || typeFilter !== "all" || categoryFilter !== "all";
  const canReprocess = canWrite || role === "va";
  const onboardingProgress = useQuery({
    queryKey: ["client-first-success", clientId],
    queryFn: () => api.get<ClientFirstSuccessProgress>(ROUTES.onboarding.progress(clientId), { showErrorToast: false }),
    enabled: focusMode === "documents",
    staleTime: 2_000,
    refetchInterval: (query) => query.state.data?.milestones.includes("documents_ready")
      ? false
      : 5_000,
  });

  // ── Backfill embeddings — one server-side sweep indexes everything unindexed ──
  // The work lives in /api/vault/index-batch (same selection + batching as the
  // vault-index cron), so navigating away no longer aborts indexing. Busy state
  // and the post-run readiness refresh are owned by VaultReadinessDashboard's
  // runningAction; the list refreshes via useVaultList's realtime invalidation.
  const handleIndexAll = useCallback(async () => {
    return api.post<{ processed: number; remaining: number }>(
      ROUTES.vault.indexBatch(),
      { clientId },
      { showErrorToast: false },
    );
  }, [clientId]);

  // ── Delete (single) ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteItems({ itemIds: [id], clientId });
      if (expanded === id) setExpanded(null);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    }
  }, [clientId, expanded, deleteItems]);

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} item${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try {
      const data = await deleteItems({ itemIds: ids, clientId });
      setSelected(new Set());
      const n = data?.deleted ?? ids.length;
      toast.success(`${n} item${n !== 1 ? "s" : ""} deleted.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed.");
    }
  }, [selected, clientId, deleteItems]);

  // ── Re-process ────────────────────────────────────────────────────────────
  const handleReprocess = useCallback(async (id: string) => {
    setReprocessing(id);
    try {
      await reprocessItem({ id, clientId });
      toast.success("Re-processing complete.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-process failed.");
    } finally {
      setReprocessing(null);
    }
  }, [clientId, reprocessItem]);

  const handleCrawlCompanyWebsite = useCallback(async () => {
    if (!companyWebsite || startingWebsiteCrawl) return;
    setStartingWebsiteCrawl(true);
    try {
      const { job } = await api.post<{ job: CrawlJob }>(
        ROUTES.vault.crawlSite(),
        { url: companyWebsite, clientId },
        { showErrorToast: false },
      );
      setCrawlJob(job);
      toast.success("Website crawl started. It will keep running if you leave this page.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The website crawl could not start.");
    } finally {
      setStartingWebsiteCrawl(false);
    }
  }, [clientId, companyWebsite, startingWebsiteCrawl]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); } else { n.add(id); }
      return n;
    });
  }

  function toggleSelectAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (vaultLoadFailed) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-red-300" />
        <p className="font-medium text-red-200">This client&apos;s Vault could not be loaded.</p>
        <p className="mt-1 text-sm text-red-300/80">
          {vaultLoadError instanceof Error
            ? vaultLoadError.message
            : "No data has been changed. Try loading it again."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          className="mt-4 gap-1.5 border-red-400/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const isEmptyVault = counts.total === 0 && !hasFilters;
  let companyWebsiteHost: string | null = null;
  if (companyWebsite) {
    try {
      companyWebsiteHost = new URL(companyWebsite).hostname.replace(/^www\./, "");
    } catch {
      companyWebsiteHost = null;
    }
  }

  if (focusMode === "documents") {
    const searchableCount = onboardingProgress.data?.readyDocumentCount ?? 0;
    const ready = Math.min(searchableCount, 3);
    const complete = onboardingProgress.data?.milestones.includes("documents_ready") ?? false;
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-950 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Step 2 of 6</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">Add three useful documents</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Start with material that explains what you sell, how you work or what customers need to know. Drop files, paste text or add a URL—RapidTal prepares it automatically.
              </p>
            </div>
            <div className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              complete ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-zinc-700 bg-zinc-950/60 text-zinc-300",
            )}>
              {complete && <CheckCircle2 className="mr-1.5 inline h-4 w-4" />}
              {onboardingProgress.isLoading
                ? "Checking…"
                : complete ? "Starter step complete" : `${ready} of 3 searchable`}
            </div>
          </div>
        </section>

        <CrawlJobPanel clientId={clientId} startedJob={crawlJob} />
        <div id="vault-add-knowledge">
          <AddVaultItem
            clientId={clientId}
            userId={userId}
            onAdded={() => {
              void refetch();
              void onboardingProgress.refetch();
            }}
            onCrawlStarted={setCrawlJob}
          />
        </div>

        {counts.processing > 0 && (
          <p className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-200">
            {counts.processing} source{counts.processing === 1 ? " is" : "s are"} being prepared. You can continue now; the dashboard updates when processing finishes.
          </p>
        )}
        {complete && searchableCount < 3 && (
          <p className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            You completed this starter step earlier. {searchableCount} source{searchableCount === 1 ? " is" : "s are"} currently searchable; add or restore sources whenever you want broader coverage.
          </p>
        )}
        {counts.error > 0 && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-200">
            {counts.error} source{counts.error === 1 ? " needs" : "s need"} attention. Open the full Vault to retry or replace them.
          </p>
        )}
        {onboardingProgress.isError && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
            Starter progress could not be checked. Your sources are safe.
            <button type="button" onClick={() => void onboardingProgress.refetch()} className="ml-2 underline underline-offset-2">Retry</button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }), "text-zinc-400")}>
            Back to your journey
          </Link>
          <Link
            href={complete ? "/dashboard" : "/vault"}
            className={buttonVariants({ variant: complete ? "default" : "outline" })}
          >
            {complete ? "Continue" : "Open full Vault"} <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {counts.total > 0 && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          )}
        </div>
      </div>

      {/* View tabs: browse items, read the recap digest, or the deep analysis */}
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-800">
        {([
          ["items", "Company sources"],
          ["recap", "Quick summary"],
          ["expanded", "Knowledge report"],
          ["competitors", "Market intelligence"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              view === v ? "border-white text-white" : "border-transparent text-zinc-400 hover:text-zinc-200",
            )}
          >
            {v === "competitors" && <Radar className="mr-1.5 inline h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {view === "competitors" ? (
        <CompetitorsTab
          clientId={clientId}
          canManage={role === "client_admin" || role === "super_admin"}
          active
        />
      ) : view === "recap" ? (
        <VaultRecap clientId={clientId} canWrite={canWrite} />
      ) : view === "expanded" ? (
        <VaultExpanded clientId={clientId} canWrite={canWrite} />
      ) : (
      <>
      <VaultReadinessDashboard
        clientId={clientId}
        canCurate={role === "client_admin" || role === "super_admin"}
        canIndex={canReprocess}
        version={`${counts.total}:${counts.ready}:${counts.processing}:${counts.error}`}
        onAdd={() => {
          setView("items");
          window.setTimeout(() => {
            document.getElementById("vault-add-knowledge")?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          });
        }}
        onIndex={handleIndexAll}
      />

      {/* Site-crawl progress — also resumes any job left running. */}
      <CrawlJobPanel clientId={clientId} startedJob={crawlJob} />

      {/* Add item — VAs and client_admin can add. Realtime invalidation refreshes the list. */}
      {(canWrite || role === "va") && (
        <div id="vault-add-knowledge">
          <AddVaultItem
            clientId={clientId}
            userId={userId}
            onAdded={() => void refetch()}
            onCrawlStarted={setCrawlJob}
          />
        </div>
      )}

      {/* Search + filter toolbar */}
      {!isEmptyVault && (
        <div id="vault-source-list" className="flex flex-col gap-3 mb-4 scroll-mt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, tags, summary, content…"
              className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1">
              {TYPE_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                    typeFilter === f.value
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  )}
                >{f.label}</button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORY_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setCategoryFilter(f.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                    categoryFilter === f.value
                      ? (f.value !== "all" ? VAULT_CATEGORIES[f.value].badgeClass : "bg-zinc-700 text-white border-zinc-700")
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  )}
                >{f.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {canWrite && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
          <span className="text-sm text-zinc-200 font-medium">{selected.size} selected</span>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Clear selected Vault items"
            title="Clear selection"
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1" />
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} className="gap-1.5 h-7 text-xs">
            {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Delete {selected.size} item{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Results count */}
      {!isEmptyVault && items.length > 0 && (
        <div className="flex items-center gap-3 mb-2">
          {canWrite && (
            <button
              onClick={toggleSelectAll}
              aria-label={selected.size === items.length ? "Deselect all Vault items" : "Select all Vault items"}
              title={selected.size === items.length ? "Deselect all" : "Select all"}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {selected.size === items.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          <p className="text-xs text-zinc-600">
            Showing {items.length}{hasNextPage ? "+" : ""}{hasFilters ? "" : ` of ${counts.total}`} item{items.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* List */}
      {isEmptyVault ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-zinc-600" />
          </div>
          <p className="text-zinc-300 font-semibold text-lg mb-1">Your Vault is empty</p>
          {canWrite && companyWebsite && companyWebsiteHost ? (
            <>
              <p className="mx-auto max-w-xl text-sm text-zinc-500">
                Start with the website already saved in Company DNA. RapidTal will collect its useful pages and prepare them in the background.
              </p>
              <Button
                type="button"
                onClick={() => void handleCrawlCompanyWebsite()}
                disabled={startingWebsiteCrawl}
                className="mt-5 gap-2"
              >
                {startingWebsiteCrawl
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />}
                Crawl {companyWebsiteHost}
              </Button>
              <p className="mt-3 text-xs text-zinc-600">You can close this page after the crawl starts.</p>
            </>
          ) : (
            <p className="text-zinc-500 text-sm">
              Add a document, paste knowledge, or enter the company website above to get started.
            </p>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center">
          <p className="text-zinc-400 text-sm">No items match your search or filters.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {items.map(item => (
              <VaultItemRow
                key={item.id}
                item={item}
                userId={userId}
                canWrite={canWrite}
                isExpanded={expanded === item.id}
                isSelected={selected.has(item.id)}
                reprocessing={reprocessing === item.id}
                onToggleExpand={() => setExpanded(expanded === item.id ? null : item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
                onEdit={() => setEditItem(item)}
                onDelete={() => handleDelete(item.id, item.title)}
                onReprocess={() => handleReprocess(item.id)}
              />
            ))}
          </div>

          {hasNextPage && (
            <div className="flex justify-center mt-4">
              <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="gap-1.5 border-zinc-700">
                {isFetchingNextPage && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* Edit drawer — VaultItemDrawer invalidates the list on save. */}
      {editItem && (
        <VaultItemDrawer
          item={editItem}
          clientId={clientId}
          onClose={() => setEditItem(null)}
          onSaved={() => setEditItem(null)}
        />
      )}
    </div>
  );
}
