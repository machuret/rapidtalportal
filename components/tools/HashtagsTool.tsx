"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { Hash, Loader2, Sparkles, Check } from "lucide-react";

interface Out { broad: string[]; niche: string[]; local: string[]; branded: string[]; note: string }
const PLATFORMS = ["Instagram", "TikTok", "LinkedIn", "Facebook", "X"];
const GROUPS: { key: keyof Omit<Out, "note">; label: string }[] = [
  { key: "broad", label: "Broad reach" },
  { key: "niche", label: "Niche (more rankable)" },
  { key: "local", label: "Local" },
  { key: "branded", label: "Branded" },
];

export function HashtagsTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.hashtags(), (initial ?? null) as Out | null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  async function copyTag(tag: string) {
    await navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag((c) => (c === tag ? null : c)), 1200);
  }

  const go = () => run({ clientId, topic: topic.trim(), platform });

  return (
    <div>
      <ToolHeader icon={Hash} tint="pink" title="Hashtag Researcher"
        subtitle="A balanced mix by reach tier — not all giant tags nothing ranks for." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Topic / niche</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder="e.g. whale watching, eco tourism, Tasmania" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-[200px]">
          <Label>Platform</Label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <Button onClick={go} disabled={loading || topic.trim().length < 2} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Research
        </Button>
      </div>

      {loading && <LoadingRow message="Researching…" />}

      {result && (
        <div className="flex flex-col gap-4 mt-6">
          {result.note && <p className="text-sm text-zinc-400">{result.note}</p>}
          <div className="flex justify-end">
            <CopyButton label="Copy all" text={[...result.broad, ...result.niche, ...result.local, ...result.branded].join(" ")} />
          </div>
          {GROUPS.map(({ key, label }) => result[key].length > 0 && (
            <div key={key} className="surface-card p-4">
              <p className="label-section mb-2">{label} <span className="text-zinc-600">· {result[key].length}</span></p>
              <div className="flex flex-wrap gap-1.5">
                {result[key].map((t, i) => (
                  <button key={i} onClick={() => copyTag(t)} title="Copy" aria-label={`Copy ${t}`}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
                    {copiedTag === t && <Check className="w-3 h-3 text-green-400" />}{t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {feedback}
    </div>
  );
}
