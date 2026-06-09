"use client";

import { useState, useEffect, useCallback } from "react";
import type { DbVaultItem, VaultCategory } from "@/types/database";
import { toast } from "sonner";
import {
  FileText, Trash2, Search, Loader2, CheckSquare, Square, X, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { VaultItemDrawer } from "./VaultItemDrawer";
import { AddVaultItem } from "./AddVaultItem";
import { VaultItemRow } from "./VaultItemRow";
import { useVaultList } from "@/hooks/useVaultList";
import { VAULT_CATEGORIES, VAULT_CATEGORY_KEYS } from "@/lib/taxonomy/vault-categories";

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
  canWrite: boolean; // client_admin or super_admin
}

// The portal layout provides a global QueryClientProvider, so this just renders.
export function VaultClient(props: VaultClientProps) {
  return <VaultClientInner {...props} />;
}

function VaultClientInner({ clientId, userId, role, canWrite }: VaultClientProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
    deleteItems,
    isDeleting: bulkDeleting,
    reprocessItem,
  } = useVaultList(clientId, { q: debouncedSearch, category: categoryFilter, type: typeFilter });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<DbVaultItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);

  const hasFilters = debouncedSearch !== "" || typeFilter !== "all" || categoryFilter !== "all";
  const canReprocess = canWrite || role === "va";

  // ── Backfill embeddings — index items so "Ask the Vault" can search them ────
  const handleIndexAll = useCallback(async () => {
    try {
      const { itemIds } = await api.get<{ itemIds: string[] }>(
        `${ROUTES.vault.unindexed()}?clientId=${clientId}`,
      );
      if (!itemIds.length) {
        toast.success("All items are already indexed for AI search.");
        return;
      }
      setIndexing({ done: 0, total: itemIds.length });
      let done = 0;
      const CONCURRENCY = 3;
      const worker = async () => {
        while (done < itemIds.length) {
          const id = itemIds[done++ ];
          if (!id) break;
          try { await api.post(ROUTES.vault.reprocess(id), { clientId }, { showErrorToast: false }); }
          catch { /* keep going; partial backfill is fine */ }
          setIndexing({ done: Math.min(done, itemIds.length), total: itemIds.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, itemIds.length) }, worker));
      toast.success(`Indexed ${itemIds.length} item${itemIds.length !== 1 ? "s" : ""} for AI search.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Indexing failed.");
    } finally {
      setIndexing(null);
    }
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

  const isEmptyVault = counts.total === 0 && !hasFilters;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vault</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Document and content store — the source of truth for AI-generated knowledge.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canReprocess && counts.total > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleIndexAll}
              disabled={indexing !== null}
              className="gap-1.5 border-zinc-700 h-8 text-xs"
              title="Build the AI search index so Ask the Vault can answer from these documents"
            >
              {indexing !== null
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing {indexing.done}/{indexing.total}</>
                : <><Sparkles className="w-3.5 h-3.5" /> Index for AI search</>}
            </Button>
          )}
          {counts.total > 0 && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {counts.total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Items", value: counts.total,      color: "text-zinc-100" },
            { label: "Ready",       value: counts.ready,      color: "text-green-400" },
            { label: "Processing",  value: counts.processing, color: "text-blue-400" },
            { label: "Errors",      value: counts.error,      color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add item — VAs and client_admin can add. Realtime invalidation refreshes the list. */}
      {(canWrite || role === "va") && (
        <AddVaultItem clientId={clientId} userId={userId} />
      )}

      {/* Search + filter toolbar */}
      {!isEmptyVault && (
        <div className="flex flex-col gap-3 mb-4">
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
          <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 hover:text-zinc-200">
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
            <button onClick={toggleSelectAll} className="text-zinc-500 hover:text-zinc-300 transition-colors">
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
          <p className="text-zinc-500 text-sm">Add a document, URL, or text above to get started.</p>
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
