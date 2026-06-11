"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount } from "./shared";
import { GalleryHorizontalEnd, Loader2, Sparkles } from "lucide-react";

interface Out { slides: { heading: string; body: string }[]; caption: string }

export function CarouselTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [topic, setTopic] = useState("");
  const { result, loading, run } = useToolRun<Out>(ROUTES.tools.carousel(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={GalleryHorizontalEnd} tint="pink" title="Carousel Breakdown"
        subtitle="A topic or article → a slide-by-slide carousel plus the caption." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <FetchUrl clientId={clientId} onFetched={setTopic} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Topic or content</Label>
            {topic.length > 200 && <CharCount len={topic.length} limit={20000} />}
          </div>
          <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={6}
            placeholder="e.g. 5 mistakes people make booking a whale tour — or paste an article."
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, topic: topic.trim() })} disabled={loading || topic.trim().length < 3} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build carousel
        </Button>
      </div>

      {loading && <LoadingRow message="Designing slides…" />}

      {result && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="flex flex-col gap-2">
            {result.slides.map((s, i) => (
              <div key={i} className="surface-card px-4 py-3 flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-bold flex items-center justify-center shrink-0 tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-100">{s.heading}</p>
                  {s.body && <p className="text-sm text-zinc-400 mt-0.5">{s.body}</p>}
                </div>
              </div>
            ))}
          </div>
          {result.caption && (
            <div className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="label-section">Caption</p>
                <CopyButton text={result.caption} />
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{result.caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
