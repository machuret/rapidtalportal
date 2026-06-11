"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Megaphone, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Ad { headline: string; body: string; angle: string }
type Platform = "meta" | "google";
const LIMITS: Record<Platform, { h: number; b: number; bLabel: string }> = {
  meta: { h: 40, b: 0, bLabel: "primary text" },
  google: { h: 30, b: 90, bLabel: "description" },
};

export function AdCopyTool({ clientId }: { clientId: string }) {
  const [offer, setOffer] = useState("");
  const [platform, setPlatform] = useState<Platform>("meta");
  const [variants, setVariants] = useState<Ad[]>([]);
  const [resultPlatform, setResultPlatform] = useState<Platform>("meta");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function run() {
    if (offer.trim().length < 3 || loading) return;
    setLoading(true); setVariants([]);
    try {
      const r = await api.post<{ platform: Platform; variants: Ad[] }>(ROUTES.tools.adCopy(), { clientId, offer: offer.trim(), platform }, { showErrorToast: false });
      setVariants(r.variants); setResultPlatform(r.platform);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } finally { setLoading(false); }
  }
  async function copy(i: number, t: string) { await navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied((c) => c === i ? null : c), 1500); }
  const lim = LIMITS[resultPlatform];

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20"><Megaphone className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-3xl font-bold text-white tracking-tight">Ad Copy Generator</h1>
          <p className="text-zinc-400 text-sm mt-1">5 ad variants with different angles, within the platform&apos;s character limits.</p></div>
      </div>
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex gap-1.5">
          {(["meta", "google"] as Platform[]).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors", platform === p ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200")}>
              {p === "meta" ? "Facebook / Instagram" : "Google Search"}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Product / offer</Label>
          <Textarea value={offer} onChange={(e) => setOffer(e.target.value)} rows={3} placeholder="e.g. Half-day whale watching tour, $129pp, departs daily from the waterfront." className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={run} disabled={loading || offer.trim().length < 3} className="gap-2 self-start">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 5 ads</Button>
      </div>
      {loading && <div className="flex items-center justify-center py-12 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Writing ads…</div>}
      {variants.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {variants.map((v, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-pink-400">{v.angle || `Variant ${i + 1}`}</span>
                <button onClick={() => copy(i, `${v.headline}\n${v.body}`)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">{copied === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy</button>
              </div>
              <p className="text-sm font-medium text-zinc-100">{v.headline}</p>
              <p className={cn("text-[11px]", v.headline.length > lim.h ? "text-red-400" : "text-zinc-500")}>{v.headline.length}/{lim.h} headline</p>
              <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{v.body}</p>
              {lim.b > 0 && <p className={cn("text-[11px]", v.body.length > lim.b ? "text-red-400" : "text-zinc-500")}>{v.body.length}/{lim.b} {lim.bLabel}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
