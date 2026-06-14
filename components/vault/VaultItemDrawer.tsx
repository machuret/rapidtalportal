"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DbVaultItem, VaultCategory } from "@/types/database";
import { X, Save, Loader2, Tag, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { vaultListKeys } from "@/hooks/useVaultList";
import { VAULT_CATEGORIES, VAULT_CATEGORY_KEYS } from "@/lib/taxonomy/vault-categories";
import { cn } from "@/lib/utils";

const CATEGORIES: { value: VaultCategory; label: string; color: string }[] =
  VAULT_CATEGORY_KEYS.map((value) => ({
    value,
    label: VAULT_CATEGORIES[value].shortLabel,
    color: VAULT_CATEGORIES[value].badgeClass,
  }));

interface VaultItemDrawerProps {
  item: DbVaultItem;
  clientId: string;
  onClose: () => void;
  onSaved: (updated: DbVaultItem) => void;
}

export function VaultItemDrawer({ item, clientId, onClose, onSaved }: VaultItemDrawerProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.raw_content ?? "");
  const [category, setCategory] = useState<VaultCategory>(item.category ?? "general");
  const [tagInput, setTagInput] = useState(item.tags?.join(", ") ?? "");

  function parseTags(raw: string): string[] {
    return raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }

  // PATCH /api/vault/[id] — JSON endpoint via api client. useMutation's isPending
  // also guards against double-submit (replaces the previous savingRef guard).
  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(ROUTES.vault.item(item.id), {
        clientId,
        title: title.trim(),
        raw_content: content.trim() || undefined,
        category,
        tags: parseTags(tagInput),
      }, { showErrorToast: false }),
    onSuccess: () => {
      toast.success("Saved. AI is re-processing…");
      // Return updated item to parent optimistically
      onSaved({ ...item, title: title.trim(), raw_content: content.trim(), category, tags: parseTags(tagInput) });
      onClose();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
    },
  });

  const saving = saveMutation.isPending;

  function handleSave() {
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (saveMutation.isPending) return; // Prevent double-submit
    saveMutation.mutate();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="overlay-backdrop"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="modal-panel fixed right-0 top-0 h-full w-full max-w-xl border-l flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-zinc-400" />
            <h2 className="font-semibold text-zinc-100">Edit Vault Item</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Title */}
          <div className="flex flex-col gap-2">
            <Label className="label-section">Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-100"
              placeholder="Document title"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <Label className="label-section">Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                    category === cat.value
                      ? cat.color + " ring-1 ring-current/50"
                      : "bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-2">
            <Label className="label-section">
              <Tag className="w-3 h-3 inline mr-1" />Tags
            </Label>
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-100"
              placeholder="onboarding, process, HR (comma-separated)"
            />
            {tagInput && (
              <div className="flex flex-wrap gap-2 mt-1">
                {parseTags(tagInput).map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs border border-zinc-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex flex-col gap-2 flex-1">
            <Label className="label-section">Content</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono text-xs leading-relaxed resize-none min-h-[300px]"
              placeholder="Document content…"
            />
            <p className="text-xs text-zinc-600">{content.length.toLocaleString()} characters</p>
          </div>

          {/* AI summary preview */}
          {item.ai_summary && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <p className="text-xs text-zinc-500 font-medium mb-1">Current AI Summary</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.ai_summary}</p>
              <p className="text-xs text-zinc-600 mt-1">Will be regenerated after saving.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center gap-3 shrink-0">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 gap-2 bg-orange-500 hover:bg-orange-400"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving & Processing…" : "Save & Re-process AI"}
          </Button>
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-400 hover:text-zinc-200">
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
