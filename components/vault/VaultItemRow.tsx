"use client";

import { cn } from "@/lib/utils";
import type { DbVaultItem } from "@/types/database";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import {
  FileText, Globe, Type, FileUp, CheckCircle2, Clock,
  AlertCircle, Loader2, ExternalLink, Pencil, Tag,
  Sparkles, CheckSquare, Square, ChevronDown, ChevronUp, Trash2,
} from "lucide-react";

const SOURCE_META = {
  pdf:  { label: "PDF",  icon: FileUp,   iconCls: "text-red-400",    bgCls: "bg-red-400/10 border-red-400/20" },
  docx: { label: "DOCX", icon: FileText,  iconCls: "text-blue-400",   bgCls: "bg-blue-400/10 border-blue-400/20" },
  text: { label: "Text", icon: Type,      iconCls: "text-purple-400", bgCls: "bg-purple-400/10 border-purple-400/20" },
  url:  { label: "URL",  icon: Globe,     iconCls: "text-green-400",  bgCls: "bg-green-400/10 border-green-400/20" },
} as const;

const STATUS_META = {
  pending:    { label: "Pending",    cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", icon: Clock },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",       icon: Loader2 },
  ready:      { label: "Ready",      cls: "bg-green-500/15 text-green-400 border-green-500/25",    icon: CheckCircle2 },
  error:      { label: "Error",      cls: "bg-red-500/15 text-red-400 border-red-500/25",          icon: AlertCircle },
} as const;

interface VaultItemRowProps {
  item: DbVaultItem;
  userId: string;
  canWrite: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  reprocessing: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReprocess: () => void;
}

export function VaultItemRow({
  item, userId, canWrite, isExpanded, isSelected, reprocessing,
  onToggleExpand, onToggleSelect, onEdit, onDelete, onReprocess,
}: VaultItemRowProps) {
  const src = SOURCE_META[item.source_type as keyof typeof SOURCE_META];
  const sta = STATUS_META[item.status];
  const SrcIcon = src?.icon ?? FileText;
  const StaIcon = sta?.icon ?? Clock;

  return (
    <div className={cn(
      "rounded-xl border bg-zinc-900 overflow-hidden transition-colors",
      isSelected ? "border-blue-500/50" : "border-zinc-800 hover:border-zinc-700"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {canWrite && (
          <button onClick={onToggleSelect} className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors">
            {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
          </button>
        )}

        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center shrink-0", src?.bgCls)}>
          <SrcIcon className={cn("w-4 h-4", src?.iconCls)} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-zinc-100 truncate">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", src?.bgCls, src?.iconCls)}>{src?.label}</span>
            {item.category && <CategoryBadge category={item.category} />}
            <span className="text-xs text-zinc-600">
              {new Date(item.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            {item.source_url && (
              <a
                href={item.source_url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-400 transition-colors max-w-[140px] truncate"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.source_url.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
          </div>
          {item.tags?.length > 0 && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Tag className="w-3 h-3 text-zinc-600 shrink-0" />
              {item.tags.slice(0, 5).map(tag => (
                <span key={tag} className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full border border-zinc-700">{tag}</span>
              ))}
              {item.tags.length > 5 && <span className="text-xs text-zinc-600">+{item.tags.length - 5}</span>}
            </div>
          )}
        </div>

        <span className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border font-medium shrink-0", sta?.cls)}>
          <StaIcon className={cn("w-3 h-3", item.status === "processing" ? "animate-spin" : "")} />
          {sta?.label}
        </span>

        {canWrite && (item.status === "error" || item.status === "ready") && (
          <button onClick={onReprocess} disabled={reprocessing} title="Re-run AI processing"
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-blue-400 transition-colors disabled:opacity-40">
            {reprocessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          </button>
        )}

        {(canWrite || item.created_by === userId) && (
          <button onClick={onEdit} title="Edit item"
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}

        {(item.raw_content || item.source_url || item.ai_summary) && (
          <button onClick={onToggleExpand}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

        {canWrite && (
          <button onClick={onDelete} title="Delete"
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded preview */}
      {isExpanded && (
        <div className="border-t border-zinc-800 px-4 py-4 bg-zinc-950/40 flex flex-col gap-3">
          {item.ai_summary && (
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-xs font-medium text-blue-400 uppercase tracking-wider">AI Summary</p>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{item.ai_summary}</p>
            </div>
          )}
          {item.source_url && !item.raw_content && (
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{item.source_url}</a>
            </p>
          )}
          {item.status === "error" && item.error_message && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{item.error_message}</p>
          )}
          {item.raw_content && (
            <div>
              <p className="label-section mb-2">Content Preview</p>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                {item.raw_content.slice(0, 400)}
                {item.raw_content.length > 400 && (
                  <span className="text-zinc-600"> …{(item.raw_content.length - 400).toLocaleString()} more characters</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
