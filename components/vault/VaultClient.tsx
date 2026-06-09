"use client";

import { useState, useMemo, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { DbVaultItem, VaultCategory } from "@/types/database";
import { toast } from "sonner";
import {
  FileText, Trash2, Search, Loader2, CheckSquare, Square, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VaultItemDrawer } from "./VaultItemDrawer";
import { AddVaultItem } from "./AddVaultItem";
import { VaultItemRow } from "./VaultItemRow";
import { useVault, vaultKeys } from "@/hooks/useVault";

const TYPE_FILTERS = [
  { value: "all" as const, label: "All Types" },
  { value: "text" as const, label: "Text" },
  { value: "url" as const, label: "URL" },
  { value: "pdf" as const, label: "PDF" },
  { value: "docx" as const, label: "DOCX" },
];

const CATEGORY_FILTERS: { value: VaultCategory | "all"; label: string }[] = [
  { value: "all",       label: "All Categories" },
  { value: "process",   label: "Process" },
  { value: "policy",    label: "Policy" },
  { value: "service",   label: "Service" },
  { value: "contact",   label: "Contact" },
  { value: "reference", label: "Reference" },
  { value: "general",   label: "General" },
];

const CATEGORY_CLS: Record<string, string> = {
  process:   "bg-blue-500/15 text-blue-400 border-blue-500/25",
  policy:    "bg-amber-500/15 text-amber-400 border-amber-500/25",
  service:   "bg-green-500/15 text-green-400 border-green-500/25",
  contact:   "bg-purple-500/15 text-purple-400 border-purple-500/25",
  reference: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  general:   "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface VaultClientProps {
  clientId: string;
  userId: string;
  role: string;
  canWrite: boolean; // client_admin or super_admin
}

// ── Component ────────────────────────────────────────────────────────────────

// The vault page has no global QueryClientProvider, so (like ContentStudio) we
// host one locally and render the real component inside it.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function VaultClient(props: VaultClientProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <VaultClientInner {...props} />
    </QueryClientProvider>
  );
}

function VaultClientInner({ clientId, userId, role, canWrite }: VaultClientProps) {
  const qc = useQueryClient();
  const {
    items,
    isLoading: loading,
    deleteItems,
    isDeleting: bulkDeleting,
    reprocessItem,
  } = useVault(clientId);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<DbVaultItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Tracks which single item is currently being re-processed (per-row spinner).
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "text" | "url" | "pdf" | "docx">("all");
  const [categoryFilter, setCategoryFilter] = useState<VaultCategory | "all">("all");

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => items.filter(item => {
    if (typeFilter !== "all" && item.source_type !== typeFilter) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchTitle   = item.title.toLowerCase().includes(q);
      const matchTags    = item.tags?.some(t => t.toLowerCase().includes(q));
      const matchSummary = item.ai_summary?.toLowerCase().includes(q);
      if (!matchTitle && !matchTags && !matchSummary) return false;
    }
    return true;
  }), [items, typeFilter, categoryFilter, search]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:      items.length,
    ready:      items.filter(i => i.status === "ready").length,
    processing: items.filter(i => i.status === "processing" || i.status === "pending").length,
    error:      items.filter(i => i.status === "error").length,
  }), [items]);

  // ── Single delete (via vault-delete edge fn) ──────────────────────────────
  // The Realtime DELETE subscription patches the query cache (list removal),
  // so we only own UI side-effects (collapse + selection cleanup) here.
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

  // ── Callbacks ─────────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); } else { n.add(id); }
      return n;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id)));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header + stats */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vault</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Document and content store — the source of truth for AI-generated knowledge.
          </p>
        </div>
        {items.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
        )}
      </div>

      {/* Stats strip */}
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Items", value: stats.total,      color: "text-zinc-100" },
            { label: "Ready",       value: stats.ready,      color: "text-green-400" },
            { label: "Processing",  value: stats.processing, color: "text-blue-400" },
            { label: "Errors",      value: stats.error,      color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add item panel — VAs and client_admin can add. onAdded omitted: Realtime handles list updates. */}
      {(canWrite || role === "va") && (
        <AddVaultItem clientId={clientId} userId={userId} />
      )}

      {/* Search + filter toolbar */}
      {items.length > 0 && (
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
            {/* Type filter */}
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
            {/* Category filter */}
            <div className="flex gap-1 flex-wrap">
              {CATEGORY_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setCategoryFilter(f.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                    categoryFilter === f.value
                      ? (f.value !== "all" ? CATEGORY_CLS[f.value as VaultCategory] : "bg-zinc-700 text-white border-zinc-700")
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
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="gap-1.5 h-7 text-xs"
          >
            {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Delete {selected.size} item{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Results count */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 mb-2">
          {canWrite && filtered.length > 0 && (
            <button onClick={toggleSelectAll} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              {selected.size === filtered.length && filtered.length > 0
                ? <CheckSquare className="w-4 h-4" />
                : <Square className="w-4 h-4" />
              }
            </button>
          )}
          <p className="text-xs text-zinc-600">
            {filtered.length === items.length
              ? `${items.length} item${items.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${items.length} items`}
          </p>
        </div>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-zinc-600" />
          </div>
          <p className="text-zinc-300 font-semibold text-lg mb-1">Your Vault is empty</p>
          <p className="text-zinc-500 text-sm">Add a document, URL, or text above to get started.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center">
          <p className="text-zinc-400 text-sm">No items match your search or filters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(item => (
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
      )}

      {/* Edit drawer */}
      {editItem && (
        <VaultItemDrawer
          item={editItem}
          clientId={clientId}
          onClose={() => setEditItem(null)}
          onSaved={(updated) => {
            // Patch the shared vault query cache (Realtime also reconciles the
            // AI metadata once vault-process completes).
            qc.setQueryData<DbVaultItem[]>(vaultKeys.byClient(clientId), (prev = []) =>
              prev.map(i => i.id === updated.id ? updated : i)
            );
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}
