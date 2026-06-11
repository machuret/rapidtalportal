"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount } from "./shared";
import { Zap, Loader2, Sparkles } from "lucide-react";

interface Hook { hook: string; technique: string }
interface Out { hooks: Hook[] }

export function HooksTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [content, setContent] = useState("");
  const { result, loading, run } = useToolRun<Out>(ROUTES.tools.hooks(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={Zap} tint="pink" title="Hook Rewriter"
        subtitle="Paste a flat post — get 10 scroll-stopping first lines, each labelled with the technique." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Your post</Label>
            <CharCount len={content.length} limit={8000} />
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6}
            placeholder="Paste the post that needs a stronger opening…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, content: content.trim() })} disabled={loading || content.trim().length < 20} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Give me 10 hooks
        </Button>
      </div>

      {loading && <LoadingRow message="Writing hooks…" />}

      {result && (
        <div className="surface-card divide-y divide-zinc-800 overflow-hidden mt-6">
          {result.hooks.map((h, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-zinc-600 tabular w-5 shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-100 font-medium">{h.hook}</p>
                {h.technique && <p className="text-[11px] text-pink-400/80 mt-0.5">{h.technique}</p>}
              </div>
              <CopyButton text={h.hook} label="" className="shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
