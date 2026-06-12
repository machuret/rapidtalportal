"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DbVaultItem, VaultSourceType } from "@/types/database";
import { toast } from "sonner";
import {
  FileText, Globe, Type, FileUp, Trash2, RefreshCw,
  Search, ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  Clock, Loader2, ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const SOURCE_META: Record<VaultSourceType, { label: string; icon: React.ElementType; iconCls: string; bgCls: string }> = {
  pdf:  { label: "PDF",  icon: FileUp,   iconCls: "text-red-400",    bgCls: "bg-red-400/10 border-red-400/20" },
  docx: { label: "DOCX", icon: FileText,  iconCls: "text-blue-400",   bgCls: "bg-blue-400/10 border-blue-400/20" },
  text: { label: "Text", icon: Type,      iconCls: "text-purple-400", bgCls: "bg-purple-400/10 border-purple-400/20" },
  url:  { label: "URL",  icon: Globe,     iconCls: "text-green-400",  bgCls: "bg-green-400/10 border-green-400/20" },
};

const STATUS_META: Record<DbVaultItem["status"], { label: string; cls: string; icon: React.ElementType }> = {
  pending:    { label: "Pending",    cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", icon: Clock },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",       icon: Loader2 },
  ready:      { label: "Ready",      cls: "bg-green-500/15 text-green-400 border-green-500/25",    icon: CheckCircle2 },
  error:      { label: "Error",      cls: "bg-red-500/15 text-red-400 border-red-500/25",          icon: AlertCircle },
};

const TYPE_FILTERS: Array<{ value: VaultSourceType | "all"; label: string }> = [
  { value: "all",  label: "All" },
  { value: "text", label: "Text" },
  { value: "url",  label: "URL" },
  { value: "pdf",  label: "PDF" },
  { value: "docx", label: "DOCX" },
];

interface VaultListProps {
  items: DbVaultItem[];
  canDelete: boolean;
}

export function VaultList({ items: initialItems, canDelete }: VaultListProps) {
  const supabase = createClient();
  const [items, setItems] = useState(initialItems);

  // Sync when server re-renders with fresh data (after router.refresh())
  useEffect(() => { setItems(initialItems); }, [initialItems]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VaultSourceType | "all">("all");

  const filtered = useMemo(() => items.filter(item => {
    const matchType = typeFilter === "all" || item.source_type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      item.title.toLowerCase().includes(q) ||
      (item.source_url ?? "").toLowerCase().includes(q) ||
      (item.raw_content ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  }), [items, search, typeFilter]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}" from the Vault? This cannot be undone.`)) return;
    setDeleting(id);
    const { error } = await supabase.from("vault_items").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
    } else {
      setItems(prev => prev.filter(i => i.id !== id));
      if (expanded === id) setExpanded(null);
      toast.success("Vault item deleted.");
    }
    setDeleting(null);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-7 h-7 text-zinc-600" />
        </div>
        <p className="text-zinc-300 font-semibold text-lg mb-1">Your Vault is empty</p>
        <p className="text-zinc-500 text-sm">Upload a document, paste text, or add a URL above to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter bar */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vault…"
            className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <div className="flex gap-1.5">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-zinc-600">
        {filtered.length === items.length
          ? `${items.length} item${items.length !== 1 ? "s" : ""}`
          : `${filtered.length} of ${items.length} items`}
      </p>

      {/* Item list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-10 text-center">
          <p className="text-zinc-400 text-sm">No items match your search.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(item => {
            const src = SOURCE_META[item.source_type];
            const sta = STATUS_META[item.status];
            const SrcIcon = src.icon;
            const StaIcon = sta.icon;
            const isExpanded = expanded === item.id;
            const hasContent = !!(item.raw_content || item.source_url);
            const preview = item.raw_content?.slice(0, 300);

            return (
              <div
                key={item.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden transition-colors hover:border-zinc-700"
              >
                {/* Row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Type icon */}
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${src.bgCls}`}>
                    <SrcIcon className={`w-4 h-4 ${src.iconCls}`} />
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-zinc-100 truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${src.bgCls} ${src.iconCls}`}>
                        {src.label}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {new Date(item.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-400 transition-colors max-w-[180px] truncate"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{item.source_url.replace(/^https?:\/\//, "")}</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium shrink-0 ${sta.cls}`}>
                    <StaIcon className={`w-3 h-3 ${item.status === "processing" ? "animate-spin" : ""}`} />
                    {sta.label}
                  </span>

                  {/* Error message inline */}
                  {item.status === "error" && item.error_message && (
                    <span className="text-xs text-red-400 max-w-[140px] truncate hidden sm:block" title={item.error_message}>
                      {item.error_message}
                    </span>
                  )}

                  {/* Expand toggle */}
                  {hasContent && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title={isExpanded ? "Collapse" : "Preview"}
                      aria-label={isExpanded ? "Collapse" : "Preview"}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}

                  {/* Delete */}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(item.id, item.title)}
                      disabled={deleting === item.id}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Delete"
                      aria-label="Delete item"
                    >
                      {deleting === item.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  )}
                </div>

                {/* Expanded preview */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 px-5 py-4 bg-zinc-950/40">
                    {item.source_url && !item.raw_content && (
                      <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{item.source_url}</a>
                      </p>
                    )}
                    {preview ? (
                      <>
                        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Content Preview</p>
                        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                          {preview}{item.raw_content && item.raw_content.length > 300 ? (
                            <span className="text-zinc-600"> …{(item.raw_content.length - 300).toLocaleString()} more characters</span>
                          ) : null}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-zinc-500 italic">
                        {item.status === "pending" || item.status === "processing"
                          ? "Content is still being processed…"
                          : "No content preview available."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
