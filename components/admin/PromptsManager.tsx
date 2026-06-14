"use client";

/**
 * Admin prompt management: grouped prompt list → editor with the live template,
 * documented [[variables]], save / reset-to-default, and version history with
 * one-click restore. Overrides go live within seconds of saving.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/LocalTime";
import {
  Loader2, Save, RotateCcw, History, ChevronDown, ChevronRight,
  Pencil, CircleDot, Braces,
} from "lucide-react";

export interface PromptRow {
  slug: string;
  title: string;
  group: string;
  description: string;
  model: string;
  variables: { name: string; description: string }[];
  defaultTemplate: string;
  override: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface Version { id: string; content: string; saved_by: string | null; created_at: string }

export function PromptsManager({ initial }: { initial: PromptRow[] }) {
  const [prompts, setPrompts] = useState(initial);
  const [selectedSlug, setSelectedSlug] = useState(initial[0]?.slug ?? "");
  const selected = prompts.find((p) => p.slug === selectedSlug) ?? prompts[0];

  const groups = useMemo(() => {
    const m = new Map<string, PromptRow[]>();
    for (const p of prompts) {
      if (!m.has(p.group)) m.set(p.group, []);
      m.get(p.group)!.push(p);
    }
    return Array.from(m.entries());
  }, [prompts]);

  const customizedCount = prompts.filter((p) => p.override !== null).length;

  function updateRow(slug: string, patch: Partial<PromptRow>) {
    setPrompts((prev) => prev.map((p) => (p.slug === slug ? { ...p, ...patch } : p)));
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Prompt list */}
      <div className="w-full lg:w-72 shrink-0">
        <p className="text-xs text-zinc-500 mb-2">
          {prompts.length} prompts · <span className={customizedCount ? "text-violet-300" : ""}>{customizedCount} customized</span>
        </p>
        <div className="surface-card overflow-hidden divide-y divide-zinc-800/70">
          {groups.map(([group, rows]) => (
            <div key={group}>
              <p className="px-3 pt-3 pb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">{group}</p>
              {rows.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => setSelectedSlug(p.slug)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    p.slug === selected?.slug ? "bg-zinc-800/80 text-white" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200",
                  )}
                >
                  <span className="truncate flex-1">{p.title}</span>
                  {p.override !== null && <CircleDot className="w-3 h-3 text-violet-400 shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      {selected && <PromptEditor key={selected.slug} prompt={selected} onChange={updateRow} />}
    </div>
  );
}

function PromptEditor({ prompt, onChange }: { prompt: PromptRow; onChange: (slug: string, patch: Partial<PromptRow>) => void }) {
  const [content, setContent] = useState(prompt.override ?? prompt.defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showDefault, setShowDefault] = useState(false);
  const [history, setHistory] = useState<Version[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isCustomized = prompt.override !== null;
  const dirty = content !== (prompt.override ?? prompt.defaultTemplate);
  const matchesDefault = content.trim() === prompt.defaultTemplate.trim();

  async function save() {
    if (saving || !content.trim()) return;
    setSaving(true);
    try {
      const res = await api.patch<{ ok: boolean; reset?: boolean }>(ROUTES.admin.prompts(), { slug: prompt.slug, content }, { showErrorToast: false });
      if (res.reset) {
        onChange(prompt.slug, { override: null, updatedAt: null, updatedBy: null });
        toast.success("Matches the default — override removed.");
      } else {
        onChange(prompt.slug, { override: content, updatedAt: new Date().toISOString(), updatedBy: "you" });
        toast.success("Saved. Live within ~30 seconds everywhere.");
      }
      setHistory(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the prompt.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (resetting) return;
    setResetting(true);
    try {
      await api.delete(`${ROUTES.admin.prompts()}?slug=${encodeURIComponent(prompt.slug)}`, undefined, { showErrorToast: false });
      onChange(prompt.slug, { override: null, updatedAt: null, updatedBy: null });
      setContent(prompt.defaultTemplate);
      toast.success("Reset to the built-in default.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reset the prompt.");
    } finally {
      setResetting(false);
    }
  }

  async function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null) {
      setLoadingHistory(true);
      try {
        const res = await api.get<{ versions: Version[] }>(`${ROUTES.admin.prompts()}?slug=${encodeURIComponent(prompt.slug)}&history=1`, { showErrorToast: false });
        setHistory(res.versions);
      } catch {
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    }
  }

  function insertVariable(name: string) {
    setContent((c) => `${c}${c.endsWith("\n") || c === "" ? "" : " "}[[${name}]]`);
  }

  return (
    <div className="flex-1 min-w-0 w-full">
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-white">{prompt.title}</h2>
              {isCustomized
                ? <span className="text-[10px] uppercase tracking-wide text-violet-300 bg-violet-500/15 border border-violet-500/30 rounded-full px-2 py-0.5">Customized</span>
                : <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">Default</span>}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{prompt.description}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-zinc-500 font-mono">{prompt.slug}</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">model: {prompt.model}</p>
          </div>
        </div>

        {isCustomized && prompt.updatedAt && (
          <p className="text-[11px] text-zinc-600 mb-3 flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Last edited <LocalTime value={prompt.updatedAt} />{prompt.updatedBy ? ` by ${prompt.updatedBy}` : ""}
          </p>
        )}

        {prompt.variables.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-4 mt-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1.5">
              <Braces className="w-3.5 h-3.5" /> Variables — filled in automatically at run time (click to insert)
            </p>
            <div className="flex flex-col gap-1.5">
              {prompt.variables.map((v) => (
                <div key={v.name} className="flex items-baseline gap-2 text-xs">
                  <button onClick={() => insertVariable(v.name)}
                    className="font-mono text-violet-300 hover:text-violet-200 bg-violet-500/10 rounded px-1.5 py-0.5 shrink-0 transition-colors">
                    [[{v.name}]]
                  </button>
                  <span className="text-zinc-500">{v.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={Math.min(28, Math.max(10, content.split("\n").length + 2))}
          spellCheck={false}
          className="w-full rounded-lg bg-zinc-950/80 border border-zinc-800 focus:border-violet-500/50 focus:outline-none text-zinc-100 text-[13px] leading-relaxed font-mono p-3.5 resize-y"
        />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[11px] text-zinc-600">{content.length.toLocaleString()} chars{matchesDefault && isCustomized ? " · matches default (saving will reset)" : ""}</p>
          {dirty && <p className="text-[11px] text-amber-400">Unsaved changes</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button onClick={save} disabled={saving || !dirty || !content.trim()} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save prompt
          </Button>
          {isCustomized && (
            <Button variant="outline" onClick={reset} disabled={resetting} className="gap-2">
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reset to default
            </Button>
          )}
          {!matchesDefault && !dirty && isCustomized && (
            <Button variant="ghost" onClick={() => setContent(prompt.defaultTemplate)} className="gap-2 text-zinc-400">
              Load default into editor
            </Button>
          )}
          <button onClick={toggleHistory} className="ml-auto inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
            <History className="w-3.5 h-3.5" /> History {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {historyOpen && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/70 overflow-hidden">
            {loadingHistory && <p className="px-3 py-3 text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading versions…</p>}
            {!loadingHistory && (history?.length ?? 0) === 0 && <p className="px-3 py-3 text-xs text-zinc-600">No saved versions yet.</p>}
            {(history ?? []).map((v) => (
              <div key={v.id} className="px-3 py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <LocalTime value={v.created_at} className="text-xs text-zinc-400" />
                  <p className="text-[11px] text-zinc-600 truncate">{v.content.slice(0, 110)}</p>
                </div>
                <button onClick={() => { setContent(v.content); toast.info("Loaded into the editor — save to make it live."); }}
                  className="text-xs text-violet-300 hover:text-violet-200 shrink-0 transition-colors">
                  Load
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Default reference when customized */}
        {isCustomized && (
          <div className="mt-4">
            <button onClick={() => setShowDefault((s) => !s)} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              {showDefault ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Built-in default for reference
            </button>
            {showDefault && (
              <pre className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5 text-[12px] leading-relaxed text-zinc-500 font-mono whitespace-pre-wrap max-h-80 overflow-y-auto">
                {prompt.defaultTemplate}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
