"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tag, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Variant { title: string; description: string; angle: string }

const TITLE_LIMIT = 60;
const DESC_LIMIT = 155;

export function MetaTool({ clientId }: { clientId: string }) {
  const [content, setContent] = useState("");
  const [keyword, setKeyword] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    if (content.trim().length < 20 || loading) return;
    setLoading(true);
    setVariants([]);
    try {
      const r = await api.post<{ variants: Variant[] }>(ROUTES.tools.meta(),
        { clientId, content: content.trim(), keyword: keyword.trim() || undefined }, { showErrorToast: false });
      setVariants(r.variants);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate variants.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Tag className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Meta Title &amp; Description</h1>
          <p className="text-zinc-400 text-sm mt-1">Paste the page content — get 5 CTR-optimised variants under the limits.</p>
        </div>
      </div>

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Target keyword <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. whale watching tours hobart"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Page content</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
            placeholder="Paste the page's main copy here…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={run} disabled={loading || content.trim().length < 20} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 5 variants
        </Button>
      </div>

      {loading && variants.length === 0 && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Writing variants…
        </div>
      )}

      {variants.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {variants.map((v, i) => {
            const tOver = v.title.length > TITLE_LIMIT;
            const dOver = v.description.length > DESC_LIMIT;
            return (
              <div key={i} className="surface-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wide text-cyan-400">{v.angle || `Option ${i + 1}`}</span>
                  <button onClick={() => copy(`v${i}`, `${v.title}\n${v.description}`)}
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
                    {copied === `v${i}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                  </button>
                </div>
                <p className="text-sm font-medium text-zinc-100">{v.title}</p>
                <p className={cn("text-[11px] mt-0.5", tOver ? "text-red-400" : "text-zinc-500")}>{v.title.length}/{TITLE_LIMIT} title</p>
                <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{v.description}</p>
                <p className={cn("text-[11px] mt-0.5", dOver ? "text-red-400" : "text-zinc-500")}>{v.description.length}/{DESC_LIMIT} description</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
