"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount } from "./shared";
import { Megaphone, Loader2, Sparkles } from "lucide-react";

interface Ad { headline: string; body: string; angle: string }
type Platform = "meta" | "google";
interface Out { platform: Platform; variants: Ad[] }

const LIMITS: Record<Platform, { h: number; b: number; bLabel: string }> = {
  meta: { h: 40, b: 0, bLabel: "primary text" },
  google: { h: 30, b: 90, bLabel: "description" },
};

export function AdCopyTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [offer, setOffer] = useState("");
  const [platform, setPlatform] = useState<Platform>("meta");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.adCopy(), (initial ?? null) as Out | null);
  const lim = LIMITS[result?.platform ?? "meta"];

  return (
    <div>
      <ToolHeader icon={Megaphone} tint="pink" title="Ad Copy Generator"
        subtitle="5 ad variants with different angles, within the platform's character limits." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex gap-1.5">
          {(["meta", "google"] as Platform[]).map((p) => (
            <button key={p} onClick={() => setPlatform(p)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                platform === p ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200")}>
              {p === "meta" ? "Facebook / Instagram" : "Google Search"}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Product / offer</Label>
          <Textarea value={offer} onChange={(e) => setOffer(e.target.value)} rows={3}
            placeholder="e.g. Half-day whale watching tour, $129pp, departs daily from the waterfront."
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, offer: offer.trim(), platform })} disabled={loading || offer.trim().length < 3} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 5 ads
        </Button>
      </div>

      {loading && <LoadingRow message="Writing ads…" />}

      {result && (
        <div className="flex flex-col gap-3 mt-6">
          {result.variants.map((v, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-pink-400">{v.angle || `Variant ${i + 1}`}</span>
                <CopyButton text={`${v.headline}\n${v.body}`} />
              </div>
              <p className="text-sm font-medium text-zinc-100">{v.headline}</p>
              <CharCount len={v.headline.length} limit={lim.h} label="headline" />
              <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{v.body}</p>
              {lim.b > 0 && <CharCount len={v.body.length} limit={lim.b} label={lim.bLabel} />}
            </div>
          ))}
        </div>
      )}
      {feedback}
    </div>
  );
}
