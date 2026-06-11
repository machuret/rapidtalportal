"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount } from "./shared";
import { Tag, Loader2, Sparkles, Wand2 } from "lucide-react";

interface Variant { title: string; description: string; angle: string }
interface Out { variants: Variant[] }

const TITLE_LIMIT = 60;
const DESC_LIMIT = 155;

export function MetaTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [content, setContent] = useState("");
  const [keyword, setKeyword] = useState("");
  const { result, setResult, loading, run } = useToolRun<Out>(ROUTES.tools.meta(), (initial ?? null) as Out | null);
  const [fixing, setFixing] = useState<number | null>(null);

  /** "Fix length": rewrite one over-limit variant in place. */
  async function fixLength(i: number, v: Variant) {
    if (fixing !== null) return;
    setFixing(i);
    try {
      const r = await api.post<Out>(ROUTES.tools.meta(),
        { clientId, content: content.trim() || v.description, shorten: { title: v.title, description: v.description } },
        { showErrorToast: false });
      const fixed = r.variants[0];
      if (fixed) setResult((prev) => prev ? { variants: prev.variants.map((x, idx) => (idx === i ? { ...fixed, angle: v.angle } : x)) } : prev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't shorten it.");
    } finally {
      setFixing(null);
    }
  }

  return (
    <div>
      <ToolHeader icon={Tag} title="Meta Title & Description"
        subtitle="Paste the page content — get 5 CTR-optimised variants under the limits." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Target keyword <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. whale watching tours hobart"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <FetchUrl clientId={clientId} onFetched={setContent} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Page content</Label>
            <CharCount len={content.length} limit={20000} />
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
            placeholder="Paste the page's main copy here…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, content: content.trim(), keyword: keyword.trim() || undefined })}
          disabled={loading || content.trim().length < 20} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 5 variants
        </Button>
      </div>

      {loading && <LoadingRow message="Writing variants…" />}

      {result && (
        <div className="flex flex-col gap-3 mt-6">
          {result.variants.map((v, i) => {
            const over = v.title.length > TITLE_LIMIT || v.description.length > DESC_LIMIT;
            return (
              <div key={i} className="surface-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wide text-cyan-400">{v.angle || `Option ${i + 1}`}</span>
                  <div className="flex items-center gap-3">
                    {over && (
                      <button onClick={() => fixLength(i, v)} disabled={fixing !== null}
                        className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50">
                        {fixing === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Fix length
                      </button>
                    )}
                    <CopyButton text={`${v.title}\n${v.description}`} />
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-100">{v.title}</p>
                <CharCount len={v.title.length} limit={TITLE_LIMIT} label="title" />
                <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{v.description}</p>
                <CharCount len={v.description.length} limit={DESC_LIMIT} label="description" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
