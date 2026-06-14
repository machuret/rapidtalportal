"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown, ChevronUp, Copy, Check, Lightbulb,
  FileText, Loader2, Pencil, Trash2, X, Save,
} from "lucide-react";
import { BrainFeedback } from "@/components/brain/BrainFeedback";

interface KbEntry {
  id: string;
  question: string;
  answer: string;
  generated_at: string;
  category: string | null;
  tags?: string[];
  source_vault_ids?: string[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "Company Info": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Services":     "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "Processes":    "bg-green-500/10 text-green-400 border-green-500/20",
  "Policies":     "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "Contact":      "bg-pink-500/10 text-pink-400 border-pink-500/20",
  "General":      "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  "Technical":    "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Billing":      "bg-red-500/10 text-red-400 border-red-500/20",
  "Support":      "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

interface KbEntryCardProps {
  entry: KbEntry;
  clientId: string;
  isExpanded: boolean;
  isEditing: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isCopied: boolean;
  canEdit: boolean;
  editForm: { question: string; answer: string; category: string };
  vaultTitleMap: Record<string, string>;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onEditFormChange: (field: "question" | "answer" | "category", value: string) => void;
}

export function KbEntryCard({
  entry, clientId, isExpanded, isEditing, isSaving, isDeleting, isCopied, canEdit,
  editForm, vaultTitleMap,
  onToggleExpand, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onCopy, onEditFormChange,
}: KbEntryCardProps) {
  const catColor = entry.category ? (CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS["General"]) : CATEGORY_COLORS["General"];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden hover:border-zinc-700 transition-all">
      <button className="w-full px-6 py-4 text-left" onClick={onToggleExpand}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {entry.category && (
                <span className={`px-2 py-1 rounded-md text-xs font-medium border ${catColor}`}>
                  {entry.category}
                </span>
              )}
              <span className="text-xs text-zinc-500">
                {new Date(entry.generated_at).toLocaleDateString()}
              </span>
            </div>
            <p className="font-semibold text-white leading-snug mb-1">{entry.question}</p>
            <p className="text-sm text-zinc-400 line-clamp-2">{entry.answer.slice(0, 150)}...</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Lightbulb className="w-4 h-4 text-zinc-500" />
            {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-800 px-6 py-4 bg-zinc-950/30">
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Question</label>
                <Input
                  value={editForm.question}
                  onChange={e => onEditFormChange("question", e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Answer</label>
                <Textarea
                  value={editForm.answer}
                  onChange={e => onEditFormChange("answer", e.target.value)}
                  rows={5}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 resize-y"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Category</label>
                <Input
                  value={editForm.category}
                  onChange={e => onEditFormChange("category", e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={onSaveEdit} disabled={isSaving} className="gap-1.5">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit} className="text-zinc-400">
                  <X className="w-3.5 h-3.5 mr-1" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="prose prose-invert max-w-none">
              <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{entry.answer}</p>
            </div>
          )}

          {!isEditing && (
            <>
              {entry.source_vault_ids && entry.source_vault_ids.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-800/60">
                  <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />Sources from Vault
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {entry.source_vault_ids.map(vaultId => {
                      const title = vaultTitleMap[vaultId];
                      if (!title) return null;
                      return (
                        <a
                          key={vaultId}
                          href="/vault"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 transition-colors"
                        >
                          <FileText className="w-3 h-3 text-zinc-500" />
                          {title}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                <div className="flex items-center gap-3">
                  <button
                    onClick={onCopy}
                    className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {isCopied ? (
                      <><Check className="w-4 h-4 text-green-400" /><span className="text-green-400">Copied!</span></>
                    ) : (
                      <><Copy className="w-4 h-4" />Copy answer</>
                    )}
                  </button>
                  <BrainFeedback clientId={clientId} surface="kb" artifactId={entry.id} artifactText={entry.answer} context={{ question: entry.question }} />
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onStartEdit}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                    >
                      <Pencil className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={onDelete}
                      disabled={isDeleting}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
