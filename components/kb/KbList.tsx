"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  BookOpen, Search, Filter, Clock, Sparkles, Loader2, Settings,
} from "lucide-react";
import { KbEntryCard } from "./KbEntryCard";
import { useKb } from "@/hooks/useKb";

interface KbEntry {
  id: string;
  question: string;
  answer: string;
  generated_at: string;
  category: string | null;
  tags?: string[];
  source_vault_ids?: string[];
}

interface LastRun {
  status: string;
  completed_at: string | null;
  entries_generated: number | null;
  error_message: string | null;
  tokens_used?: number | null;
}

interface KbListProps {
  entries: KbEntry[];
  lastRun: LastRun | null;
  canRegenerate: boolean;
  clientId: string;
  vaultTitleMap?: Record<string, string>;
}

const DEFAULT_CATEGORIES = [
  "Company Info", "Services", "Processes", "Policies",
  "Contact", "General", "Technical", "Billing", "Support",
];

export function KbList({ entries: initialEntries, lastRun, canRegenerate, clientId, vaultTitleMap = {} }: KbListProps) {
  const router = useRouter();
  const { generate, isGenerating: generating, updateEntry, deleteEntry: deleteEntryMutation } = useKb(clientId);
  const generatingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [entries, setEntries] = useState(initialEntries);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pollElapsed, setPollElapsed] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ question: string; answer: string; category: string }>({ question: "", answer: "", category: "" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCategoryConfig, setShowCategoryConfig] = useState(false);
  const [customCategories, setCustomCategories] = useState(DEFAULT_CATEGORIES.join(", "));

  useEffect(() => { setEntries(initialEntries); }, [initialEntries]);

  // Category is stored in DB — use it directly, fall back to "General"
  const categorizedEntries = useMemo(
    () => entries.map(e => ({ ...e, category: e.category ?? "General" })),
    [entries]
  );

  const filtered = useMemo(() => {
    let filtered = categorizedEntries;
    
    if (selectedCategory !== "All") {
      filtered = filtered.filter(e => e.category === selectedCategory);
    }
    
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e => 
        e.question.toLowerCase().includes(q) ||
        e.answer.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [categorizedEntries, selectedCategory, search]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    categorizedEntries.forEach(entry => {
      const cat = entry.category || "General";
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return stats;
  }, [categorizedEntries]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPollElapsed(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  async function copyAnswer(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function regenerate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setPollElapsed(0);
    setShowCategoryConfig(false);

    let elapsed = 0;
    pollIntervalRef.current = setInterval(() => {
      elapsed += 1;
      setPollElapsed(elapsed);
    }, 1000);

    try {
      const data = await generate({
        clientId,
        customCategories: customCategories.split(",").map(c => c.trim()).filter(Boolean),
      });
      toast.success(`Knowledge base regenerated — ${data.count} entries created.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      stopPolling();
      generatingRef.current = false;
    }
  }

  function startEdit(entry: KbEntry) {
    setEditingId(entry.id);
    setEditForm({ question: entry.question, answer: entry.answer, category: entry.category ?? "General" });
    setExpanded(entry.id);
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    try {
      await updateEntry({ id, clientId, ...editForm });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...editForm } : e));
      setEditingId(null);
      toast.success("Entry updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteEntry(id: string) {
    setDeletingId(id);
    try {
      await deleteEntryMutation({ id, clientId });
      setEntries(prev => prev.filter(e => e.id !== id));
      if (expanded === id) setExpanded(null);
      toast.success("Entry deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Search and filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search questions, answers, categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-900/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
            />
          </div>
          {canRegenerate && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCategoryConfig(o => !o)}
                className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
                disabled={generating}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button 
                onClick={regenerate} 
                disabled={generating} 
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg shadow-blue-500/20 min-w-[160px]"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {pollElapsed > 0 ? `Generating… ${pollElapsed}s` : "Starting…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Regenerate KB
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Category config panel */}
        {showCategoryConfig && canRegenerate && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <p className="text-sm font-medium text-zinc-300 mb-2">Custom categories for AI to use when generating entries</p>
            <p className="text-xs text-zinc-500 mb-3">Comma-separated list. The AI will assign each Q&A to one of these categories.</p>
            <Input
              value={customCategories}
              onChange={e => setCustomCategories(e.target.value)}
              placeholder="Company Info, Services, Processes, Policies..."
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 text-sm"
            />
          </div>
        )}

        {/* Category filters — dynamic from actual DB entries */}
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-zinc-500" />
          {["All", ...Object.keys(categoryStats).sort()].map(cat => {
            const count = cat === "All" ? entries.length : (categoryStats[cat] || 0);
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 border border-zinc-700"
                }`}
              >
                {cat}
                <span className="ml-1.5 text-xs opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status banner */}
      {lastRun && (
        <div className={`rounded-xl border backdrop-blur-sm px-5 py-4 ${
          lastRun.status === "completed" 
            ? "bg-green-500/10 border-green-500/20 text-green-300" 
            : lastRun.status === "failed" 
              ? "bg-red-500/10 border-red-500/20 text-red-300"
              : "bg-zinc-800/50 border-zinc-700 text-zinc-400"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4" />
              <span className="font-medium">
                Last generation: <span className="capitalize">{lastRun.status}</span>
              </span>
              {lastRun.entries_generated != null && (
                <span>· {lastRun.entries_generated} entries</span>
              )}
              {lastRun.tokens_used && (
                <span>· {Math.round(lastRun.tokens_used / 1000)}k tokens</span>
              )}
              {lastRun.completed_at && (
                <span>· {new Date(lastRun.completed_at).toLocaleDateString()}</span>
              )}
            </div>
            {lastRun.error_message && (
              <span className="text-sm text-red-400">{lastRun.error_message}</span>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-16 text-center">
          <BookOpen className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <p className="text-xl font-semibold text-zinc-300 mb-2">
            {entries.length === 0 ? "No knowledge base entries yet" : "No results match your search"}
          </p>
          <p className="text-zinc-500 text-sm">
            {entries.length === 0 && canRegenerate 
              ? "Add documents to the Vault and click 'Regenerate KB' to create entries."
              : "Try adjusting your search or category filters."
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">
            Showing {filtered.length} of {entries.length} entries
          </p>
          
          {filtered.map((entry) => (
            <KbEntryCard
              key={entry.id}
              entry={entry}
              isExpanded={expanded === entry.id}
              isEditing={editingId === entry.id}
              isSaving={savingId === entry.id}
              isDeleting={deletingId === entry.id}
              isCopied={copied === entry.id}
              canEdit={canRegenerate}
              editForm={editForm}
              vaultTitleMap={vaultTitleMap}
              onToggleExpand={() => setExpanded(expanded === entry.id ? null : entry.id)}
              onStartEdit={() => startEdit(entry)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => saveEdit(entry.id)}
              onDelete={() => deleteEntry(entry.id)}
              onCopy={() => copyAnswer(entry.id, entry.answer)}
              onEditFormChange={(field, value) => setEditForm(f => ({ ...f, [field]: value }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
