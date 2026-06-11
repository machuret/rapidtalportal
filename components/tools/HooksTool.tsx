"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Zap, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Hook { hook: string; technique: string }

export function HooksTool({ clientId }: { clientId: string }) {
  const [content, setContent] = useState("");
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function run() {
    if (content.trim().length < 20 || loading) return;
    setLoading(true);
    setHooks([]);
    try {
      const r = await api.post<{ hooks: Hook[] }>(ROUTES.tools.hooks(),
        { clientId, content: content.trim() }, { showErrorToast: false });
      setHooks(r.hooks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate hooks.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(i: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Hook Rewriter</h1>
          <p className="text-zinc-400 text-sm mt-1">Paste a flat post — get 10 scroll-stopping first lines, each labelled with the technique.</p>
        </div>
      </div>

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Your post</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6}
            placeholder="Paste the post that needs a stronger opening…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={run} disabled={loading || content.trim().length < 20} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Give me 10 hooks
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Writing hooks…
        </div>
      )}

      {hooks.length > 0 && (
        <div className="surface-card divide-y divide-zinc-800 overflow-hidden mt-6">
          {hooks.map((h, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-zinc-600 tabular w-5 shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-100 font-medium">{h.hook}</p>
                {h.technique && <p className="text-[11px] text-pink-400/80 mt-0.5">{h.technique}</p>}
              </div>
              <button onClick={() => copy(i, h.hook)} className="text-zinc-500 hover:text-white shrink-0">
                {copied === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
