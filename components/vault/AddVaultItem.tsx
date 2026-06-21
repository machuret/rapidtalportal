"use client";

import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { vaultListKeys } from "@/hooks/useVaultList";
import { cn } from "@/lib/utils";
import { CloudUpload, Globe, Type, Loader2, Sparkles, Plus } from "lucide-react";

import type { CrawlJob } from "./CrawlJobPanel";

interface AddVaultItemProps {
  clientId: string;
  userId: string;
  onAdded?: () => void;
  onCrawlStarted?: (job: CrawlJob) => void;
}

const ACCEPTED = ".pdf,.docx,.txt,.md,.csv";
const URL_RE = /^https?:\/\/\S+$/i;

/**
 * One-box add: drop files (multiple), paste text, or paste a URL — the box
 * figures out which. No title/category/tags to fill in: titles are derived
 * server-side and category/tags come from AI processing.
 */
export function AddVaultItem({ clientId, onAdded, onCrawlStarted }: AddVaultItemProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const isUrl = URL_RE.test(text.trim());

  const done = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
    onAdded?.();
  }, [queryClient, clientId, onAdded]);

  // ── Files (one or many) ─────────────────────────────────────────────────────
  async function uploadFiles(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    let ok = 0;
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("clientId", clientId);
        const res = await fetch(ROUTES.vault.upload(), { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Upload failed.");
        if (j.warning) toast.warning(`${f.name}: ${j.warning}`);
        ok++;
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : "failed"}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setBusy(false);
    setProgress(null);
    if (ok) toast.success(`${ok} file${ok !== 1 ? "s" : ""} added — AI is processing.`);
    for (const err of errors.slice(0, 3)) toast.error(err);
    done();
  }

  // ── Text / URL (auto-detected) ──────────────────────────────────────────────
  async function submitText(aiCrawl: boolean) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (URL_RE.test(value)) {
        if (aiCrawl) {
          // Full-site crawl: maps + scrapes the whole site via Firecrawl, then
          // classifies pages, builds a product catalog, and writes a dossier.
          const { job } = await api.post<{ job: CrawlJob }>(
            ROUTES.vault.crawlSite(), { url: value, clientId }, { showErrorToast: false },
          );
          toast.success("Site crawl started — progress shows above.");
          onCrawlStarted?.(job);
        } else {
          await api.post(ROUTES.vault.url(), { url: value, clientId }, { showErrorToast: false });
          toast.success("URL added — fetching and processing.");
        }
      } else {
        await api.post(ROUTES.vault.text(), { content: value, clientId }, { showErrorToast: false });
        toast.success("Added to Vault — AI is processing.");
      }
      setText("");
      done();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        uploadFiles(Array.from(e.dataTransfer.files ?? []));
      }}
      className={cn(
        "rounded-xl border bg-zinc-900 p-4 mb-6 transition-colors",
        dragging ? "border-blue-500/60 bg-blue-500/5" : "border-zinc-800",
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Plus className="w-4 h-4 text-zinc-400" />
        <p className="text-sm font-medium text-zinc-200">Add to the Vault</p>
        <p className="text-xs text-zinc-500 hidden sm:block">
          — drop files, paste text, or paste a URL. AI handles titles, categories and tags.
        </p>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={text.length > 120 ? 6 : 2}
        disabled={busy}
        placeholder="Paste text or a URL here… or drop files anywhere on this box."
        className="bg-zinc-950/60 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm mb-3"
      />

      <div className="flex items-center gap-2 flex-wrap">
        {/* Files */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => {
            uploadFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 border-zinc-700"
        >
          {progress ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading {progress.done}/{progress.total}</>
          ) : (
            <><CloudUpload className="w-3.5 h-3.5" /> Choose files</>
          )}
        </Button>

        {/* Text / URL actions */}
        {text.trim() && (isUrl ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => submitText(false)} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              Add page
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => submitText(true)} className="gap-1.5 border-zinc-700"
              title="Crawl the entire site: every meaningful page stored, products aggregated, plus a full company dossier">
              <Sparkles className="w-3.5 h-3.5" /> Crawl whole site
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => submitText(false)} className="gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Type className="w-3.5 h-3.5" />}
            Add text
          </Button>
        ))}

        <span className="text-2xs text-zinc-600 ml-auto hidden sm:inline">
          PDF, DOCX, TXT, MD, CSV · up to 25MB each
        </span>
      </div>
    </div>
  );
}
