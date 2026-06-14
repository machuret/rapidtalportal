"use client";

import { cn, formatDate } from "@/lib/utils";
import type { CrmContact } from "@/app/(portal)/crm/page";
import { CRM_STATUS_META } from "@/lib/crm-config";
import { Mail, Phone, ExternalLink, Tag, CalendarDays } from "lucide-react";

interface CrmContactCardProps {
  contact: CrmContact;
  isSelected: boolean;
  onClick: () => void;
}

function initials(c: CrmContact) {
  return `${c.first_name[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
}

export function CrmContactCard({ contact: c, isSelected, onClick }: CrmContactCardProps) {
  const sm = CRM_STATUS_META[c.status] ?? CRM_STATUS_META.lead;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border bg-zinc-900 p-4 transition-all hover:border-zinc-600 hover:bg-zinc-800/60 group",
        isSelected ? "border-blue-500/50 bg-zinc-800/60 ring-1 ring-blue-500/20" : "border-zinc-800"
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200 shrink-0">
          {initials(c)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-zinc-100 truncate">{c.first_name} {c.last_name}</p>
          <p className="text-xs text-zinc-500 truncate">
            {c.job_title ?? ""}{c.job_title && c.company ? " · " : ""}{c.company ?? ""}
          </p>
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium shrink-0", sm.cls)}>
          {sm.label}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {c.email && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 truncate">
            <Mail className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
        {c.phone && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Phone className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            {c.phone}
          </div>
        )}
        {c.source && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ExternalLink className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            {c.source}
          </div>
        )}
      </div>

      {c.tags?.length > 0 && (
        <div className="flex items-center gap-1 mt-3 flex-wrap">
          <Tag className="w-3 h-3 text-zinc-600 shrink-0" />
          {c.tags.slice(0, 3).map(t => (
            <span key={t} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-1 text-xs text-zinc-600">
          <CalendarDays className="w-3.5 h-3.5" />
          {formatDate(c.created_at, { day: "numeric", month: "short", year: "numeric" })}
        </div>
        {c.updated_at !== c.created_at && (
          <span className="text-xs text-zinc-600">
            Updated {formatDate(c.updated_at, { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </button>
  );
}
