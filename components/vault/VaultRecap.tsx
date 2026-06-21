"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Markdown } from "./Markdown";
import { VAULT_CATEGORIES, isVaultCategory } from "@/lib/taxonomy/vault-categories";
import {
  Loader2, FileText, ExternalLink, ChevronDown, ChevronRight, BookOpen, Package, Sparkles, AlertTriangle, RefreshCw,
} from "lucide-react";

interface RecapItem {
  id: string; source_type: string; title: string; source_url: string | null;
  status: string; category: string | null; tags: string[]; ai_summary: string | null; created_at: string;
}
interface HeroItem extends RecapItem { raw_content: string }
interface RecapData {
  counts: { total: number; ready: number; processing: number; error: number };
  dossier: HeroItem | null;
  catalog: HeroItem | null;
  items: RecapItem[];
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = { ready: "bg-green-500", processing: "bg-orange-500 animate-pulse", pending: "bg-orange-500 animate-pulse", error: "bg-red-500" };
  return <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", map[status] ?? "bg-zinc-500")} />;
}

export function VaultRecap({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<RecapData>(`${ROUTES.vault.recap()}?clientId=${clientId}`, { showErrorToast: false });
      setData(d);
    } catch { setData(null); }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const refreshDossier = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await api.post<{ unverified: string[]; itemsSummarized: number }>(
        ROUTES.vault.refreshDossier(), { clientId }, { showErrorToast: false },
      );
      toast.success(`Dossier rebuilt from ${r.itemsSummarized} items${r.unverified.length ? ` · ${r.unverified.length} figure(s) flagged` : ""}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't refresh the dossier.");
    } finally {
      setRefreshing(false);
    }
  }, [clientId, load]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, RecapItem[]>();
    for (const it of data.items) {
      const key = it.category && isVaultCategory(it.category) ? it.category : "general";
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  }
  if (!data || data.counts.total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
        <FileText className="w-7 h-7 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-300 font-semibold">Nothing to recap yet</p>
        <p className="text-zinc-500 text-sm mt-1">Crawl a site or add documents, then come back here for the digest.</p>
      </div>
    );
  }

  const { counts } = data;

  return (
    <div>
      {/* Indexed status strip — "what is actually indexed" */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-6 text-sm">
        <span className="text-zinc-400"><span className="font-semibold text-zinc-100">{counts.total}</span> items</span>
        <span className="flex items-center gap-1.5 text-green-400"><span className="w-2 h-2 rounded-full bg-green-500" />{counts.ready} indexed</span>
        {counts.processing > 0 && <span className="flex items-center gap-1.5 text-blue-400"><span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />{counts.processing} indexing…</span>}
        {counts.error > 0 && <span className="flex items-center gap-1.5 text-red-400"><AlertTriangle className="w-3.5 h-3.5" />{counts.error} failed (use “Index for AI search”)</span>}
        {canWrite && (
          <Button
            size="sm" variant="outline" onClick={refreshDossier} disabled={refreshing}
            className="ml-auto gap-1.5 border-zinc-700 h-8 text-xs"
            title="Rebuild the Company Dossier from everything currently in the vault, including newly added items"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {data.dossier ? "Refresh dossier" : "Generate dossier"}
          </Button>
        )}
      </div>

      {/* Company Dossier — the full picture */}
      {data.dossier && (
        <section className="surface-card rounded-xl p-5 mb-6 border-violet-500/30">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide">Company Dossier</h2>
            {data.dossier.source_url && (
              <a href={data.dossier.source_url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                {(() => { try { return new URL(data.dossier.source_url).hostname; } catch { return "source"; } })()}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {data.dossier.raw_content
            ? <Markdown content={data.dossier.raw_content} />
            : <p className="text-sm text-zinc-500">Dossier is still being generated…</p>}
        </section>
      )}

      {/* Product Catalog — collapsible */}
      {data.catalog && (
        <section className="surface-card rounded-xl mb-6 overflow-hidden">
          <button onClick={() => setShowCatalog((s) => !s)} className="w-full flex items-center gap-2 p-4 hover:bg-zinc-800/40 transition-colors">
            <Package className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Product Catalog</h2>
            {showCatalog ? <ChevronDown className="w-4 h-4 text-zinc-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />}
          </button>
          {showCatalog && <div className="px-5 pb-5"><Markdown content={data.catalog.raw_content} /></div>}
        </section>
      )}

      {/* Page recaps, grouped by category */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Page recaps</h2>
        <span className="text-xs text-zinc-500">— one summary per indexed page</span>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-zinc-500">No individual page recaps yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([cat, items]) => {
            const meta = isVaultCategory(cat) ? VAULT_CATEGORIES[cat] : null;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn("text-2xs font-medium rounded-full px-2 py-0.5", meta?.badgeClass ?? "bg-zinc-800 text-zinc-300")}>
                    {meta?.shortLabel ?? cat}
                  </span>
                  <span className="text-xs text-zinc-600">{items.length}</span>
                </div>
                <div className="surface-card rounded-xl divide-y divide-zinc-800 overflow-hidden">
                  {items.map((it) => (
                    <div key={it.id} className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusDot status={it.status} />
                        <p className="text-sm font-medium text-zinc-100 flex-1 truncate">{it.title}</p>
                        {it.source_url && (
                          <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-blue-400 shrink-0">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        {it.ai_summary
                          ? it.ai_summary
                          : it.status === "error"
                            ? <span className="text-red-400/80">Indexing failed — re-run “Index for AI search”.</span>
                            : <span className="text-zinc-600 italic">Recap is being generated…</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
