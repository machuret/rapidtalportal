"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { GalleryHorizontalEnd, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Carousel { slides: { heading: string; body: string }[]; caption: string }

export function CarouselTool({ clientId }: { clientId: string }) {
  const [topic, setTopic] = useState("");
  const [res, setRes] = useState<Carousel | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    if (topic.trim().length < 3 || loading) return;
    setLoading(true); setRes(null);
    try { setRes(await api.post<Carousel>(ROUTES.tools.carousel(), { clientId, topic: topic.trim() }, { showErrorToast: false })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } finally { setLoading(false); }
  }
  async function copy(k: string, t: string) { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied((c) => c === k ? null : c), 1500); }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20"><GalleryHorizontalEnd className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-3xl font-bold text-white tracking-tight">Carousel Breakdown</h1>
          <p className="text-zinc-400 text-sm mt-1">A topic or article → a slide-by-slide carousel plus the caption.</p></div>
      </div>
      <div className="surface-card p-5 flex flex-col gap-4">
        <FetchUrl clientId={clientId} onFetched={setTopic} />
        <div className="flex flex-col gap-1.5">
          <Label>Topic or content</Label>
          <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={6} placeholder="e.g. 5 mistakes people make booking a whale tour — or paste an article." className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={run} disabled={loading || topic.trim().length < 3} className="gap-2 self-start">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build carousel</Button>
      </div>
      {loading && <div className="flex items-center justify-center py-12 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Designing slides…</div>}
      {res && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="flex flex-col gap-2">
            {res.slides.map((s, i) => (
              <div key={i} className="surface-card px-4 py-3 flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-bold flex items-center justify-center shrink-0 tabular">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-100">{s.heading}</p>
                  {s.body && <p className="text-sm text-zinc-400 mt-0.5">{s.body}</p>}
                </div>
              </div>
            ))}
          </div>
          {res.caption && (
            <div className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="label-section">Caption</p>
                <button onClick={() => copy("cap", res.caption)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">{copied === "cap" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy</button>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{res.caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
