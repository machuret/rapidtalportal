"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DbVaultItem,
  VaultAuthorityLevel,
  VaultCategory,
  VaultKnowledgeStatus,
} from "@/types/database";
import { AlertTriangle, History, X, Save, Loader2, Tag, FolderOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { vaultListKeys } from "@/hooks/useVaultList";
import { useVaultSourceOptions } from "@/hooks/useVaultSourceOptions";
import { VAULT_CATEGORIES, VAULT_CATEGORY_KEYS } from "@/lib/taxonomy/vault-categories";
import { cn, formatDate, formatNumber } from "@/lib/utils";

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

interface VaultItemVersionSummary {
  id: string;
  version_number: number;
  title: string;
  authority_level: VaultAuthorityLevel;
  knowledge_status: VaultKnowledgeStatus;
  has_conflict: boolean;
  captured_at: string;
}

export function VaultItemDrawer({ item, clientId, onClose, onSaved }: VaultItemDrawerProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item.title);
  // The list API omits raw_content (payload size) — fetch it on open. The
  // Content field stays disabled until loaded, and a save only sends
  // raw_content when it was actually fetched AND changed. Before this, the
  // field always opened empty and any save wiped the whole document.
  const [content, setContent] = useState("");
  const [contentLoaded, setContentLoaded] = useState(false);
  const originalContentRef = useRef("");
  const [category, setCategory] = useState<VaultCategory>(item.category ?? "general");
  const [tagInput, setTagInput] = useState(item.tags?.join(", ") ?? "");
  const [authorityLevel, setAuthorityLevel] = useState<VaultAuthorityLevel>(
    item.authority_level ?? "supporting",
  );
  const [knowledgeStatus, setKnowledgeStatus] = useState<VaultKnowledgeStatus>(
    item.knowledge_status ?? "active",
  );
  const [timeSensitive, setTimeSensitive] = useState(item.time_sensitive ?? false);
  const [validFrom, setValidFrom] = useState(item.valid_from ?? "");
  const [validUntil, setValidUntil] = useState(item.valid_until ?? "");
  const [reviewDueAt, setReviewDueAt] = useState(item.review_due_at?.slice(0, 10) ?? "");
  const [supersedesItemId, setSupersedesItemId] = useState(item.supersedes_item_id ?? "");
  const [hasConflict, setHasConflict] = useState(item.has_conflict ?? false);
  const [conflictNote, setConflictNote] = useState(item.conflict_note ?? "");
  // Supersession stays optional: a source-list failure surfaces inside the
  // hook and never blocks editing.
  const { options: sourceOptions } = useVaultSourceOptions(clientId, { excludeId: item.id });
  const [versions, setVersions] = useState<VaultItemVersionSummary[]>([]);

  useEffect(() => {
    let active = true;
    void api.get<{ raw_content: string | null }>(
      ROUTES.vault.itemContent(item.id, clientId),
      { showErrorToast: false },
    ).then((result) => {
      if (!active) return;
      originalContentRef.current = result.raw_content ?? "";
      setContent(result.raw_content ?? "");
      setContentLoaded(true);
    }).catch(() => {
      // Content stays disabled and unsavable when it can't be fetched — an
      // unreachable document must fail closed, never be replaced by guesses.
    });
    void api.get<{ versions: VaultItemVersionSummary[] }>(
      `${ROUTES.vault.itemVersions(item.id)}?clientId=${clientId}`,
      { showErrorToast: false },
    ).then((result) => {
      if (active) setVersions(result.versions);
    }).catch(() => {
      // History is supplementary; governance editing remains available.
    });
    return () => { active = false; };
  }, [clientId, item.id]);

  // Dialog semantics: Escape takes the same close path as the X — except when
  // a select/textarea owns the key (native select popup, in-progress edits),
  // or an inner control already consumed it (defaultPrevented).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "select" || tag === "textarea") return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function parseTags(raw: string): string[] {
    return raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }

  // PATCH /api/vault/[id] — JSON endpoint via api client. useMutation's isPending
  // also guards against double-submit (replaces the previous savingRef guard).
  const saveMutation = useMutation({
    mutationFn: () => {
      // Send governance fields ONLY when actually changed — the route treats
      // their mere presence as a governance write and 403s non-admins, so a VA
      // fixing a typo used to be rejected for fields they never touched.
      const normDate = (v: string | null | undefined) => (v ?? "").slice(0, 10) || null;
      const gov: Record<string, unknown> = {};
      if (authorityLevel !== (item.authority_level ?? "supporting")) gov.authority_level = authorityLevel;
      if (knowledgeStatus !== (item.knowledge_status ?? "active")) gov.knowledge_status = knowledgeStatus;
      if (timeSensitive !== (item.time_sensitive ?? false)) gov.time_sensitive = timeSensitive;
      if ((validFrom || null) !== normDate(item.valid_from)) gov.valid_from = validFrom || null;
      if ((validUntil || null) !== normDate(item.valid_until)) gov.valid_until = validUntil || null;
      if ((reviewDueAt || null) !== normDate(item.review_due_at)) gov.review_due_at = reviewDueAt || null;
      if ((supersedesItemId || null) !== (item.supersedes_item_id ?? null)) gov.supersedes_item_id = supersedesItemId || null;
      if (hasConflict !== (item.has_conflict ?? false)) gov.has_conflict = hasConflict;
      if (hasConflict || conflictNote.trim() !== (item.conflict_note ?? "")) {
        gov.conflict_note = hasConflict ? conflictNote.trim() : null;
      }
      return api.patch(ROUTES.vault.item(item.id), {
        clientId,
        title: title.trim(),
        raw_content: contentLoaded && content.trim() !== originalContentRef.current.trim()
          ? content.trim() || undefined
          : undefined,
        category,
        tags: parseTags(tagInput),
        ...gov,
      }, { showErrorToast: false });
    },
    onSuccess: () => {
      toast.success("Source saved. Knowledge safeguards are active.");
      // Return updated item to parent optimistically
      onSaved({
        ...item,
        title: title.trim(),
        raw_content: content.trim(),
        category,
        tags: parseTags(tagInput),
        authority_level: authorityLevel,
        knowledge_status: knowledgeStatus,
        time_sensitive: timeSensitive,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        review_due_at: reviewDueAt || null,
        supersedes_item_id: supersedesItemId || null,
        has_conflict: hasConflict,
        conflict_note: hasConflict ? conflictNote.trim() : null,
      });
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
    if (validFrom && validUntil && validUntil < validFrom) {
      toast.error("The valid-until date cannot be before the valid-from date.");
      return;
    }
    if (hasConflict && !conflictNote.trim()) {
      toast.error("Describe the conflicting information before saving.");
      return;
    }
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit Vault Item"
        className="modal-panel fixed right-0 top-0 h-full w-full max-w-xl border-l flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-zinc-400" />
            <h2 className="font-semibold text-zinc-100">Edit Vault Item</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
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
              autoFocus
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

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="mb-4 flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-300" />
              <div>
                <p className="text-sm font-medium text-zinc-200">Source authority and lifecycle</p>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                  These safeguards decide whether AI may use this source as company fact.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Authority</span>
                <select
                  value={authorityLevel}
                  onChange={(event) => setAuthorityLevel(event.target.value as VaultAuthorityLevel)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
                >
                  <option value="authoritative">Authoritative company source</option>
                  <option value="supporting">Supporting source</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Lifecycle</span>
                <select
                  value={knowledgeStatus}
                  onChange={(event) => setKnowledgeStatus(event.target.value as VaultKnowledgeStatus)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
                >
                  <option value="active">Active and usable</option>
                  <option value="review_required">Requires review</option>
                  <option value="superseded">Superseded — never use</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Valid from</span>
                <Input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className="border-zinc-700 bg-zinc-950" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Valid until</span>
                <Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="border-zinc-700 bg-zinc-950" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Review by</span>
                <Input type="date" value={reviewDueAt} onChange={(event) => setReviewDueAt(event.target.value)} className="border-zinc-700 bg-zinc-950" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Replaces an older source</span>
                <select
                  value={supersedesItemId}
                  onChange={(event) => setSupersedesItemId(event.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
                >
                  <option value="">Does not replace another source</option>
                  {sourceOptions.map((source) => (
                    <option key={source.id} value={source.id}>{source.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={timeSensitive}
                onChange={(event) => setTimeSensitive(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-950"
              />
              This information changes over time
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={hasConflict}
                onChange={(event) => setHasConflict(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-950"
              />
              This source conflicts with other company information
            </label>
            {hasConflict && (
              <div className="mt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Explain the conflict
                </div>
                <Textarea
                  value={conflictNote}
                  onChange={(event) => setConflictNote(event.target.value)}
                  rows={3}
                  placeholder="Describe what conflicts and which source should be checked."
                  className="border-red-500/30 bg-zinc-950 text-sm"
                />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex flex-col gap-2 flex-1">
            <Label className="label-section">Content</Label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={!contentLoaded}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono text-xs leading-relaxed resize-none min-h-[300px]"
              placeholder={contentLoaded ? "Document content…" : "Loading document…"}
            />
            <p className="text-xs text-zinc-600">{formatNumber(content.length)} characters</p>
          </div>

          {/* AI summary preview */}
          {item.ai_summary && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <p className="text-xs text-zinc-500 font-medium mb-1">Knowledge summary</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{item.ai_summary}</p>
              <p className="text-xs text-zinc-600 mt-1">Updates automatically when the source content changes.</p>
            </div>
          )}

          {versions.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-300">
                <History className="h-4 w-4 text-zinc-500" />
                Source history · {versions.length} captured version{versions.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-3 space-y-2">
                {versions.slice(0, 8).map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
                    <span className="font-medium text-zinc-300">Version {version.version_number}</span>
                    <span className="text-zinc-600">
                      {formatDate(version.captured_at, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span className="text-zinc-500">{version.authority_level}</span>
                    <span className="text-zinc-500">{version.knowledge_status.replace("_", " ")}</span>
                    {version.has_conflict && <span className="text-red-300">conflict flagged</span>}
                  </div>
                ))}
              </div>
            </details>
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
            {saving ? "Saving…" : "Save source"}
          </Button>
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-400 hover:text-zinc-200">
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
