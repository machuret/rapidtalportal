"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Groups { broad: string[]; niche: string[]; local: string[]; branded: string[]; note: string }
const PLATFORMS = ["Instagram", "TikTok", "LinkedIn", "Facebook", "X"];
const GROUPS: { key: keyof Omit<Groups, "note">; label: string }[] = [
  { key: "broad", label: "Broad reach" },
  { key: "niche", label: "Niche (more rankable)" },
  { key: "local", label: "Local" },
  { key: "branded", label: "Branded" },
];

export function HashtagsTool({ clientId }: { clientId: string }) {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [res, setRes] = useState<Groups | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (topic.trim().length < 2 || loading) return;
    setLoading(true); setRes(null);
    try { setRes(await api.post<Groups>(ROUTES.tools.hashtags(), { clientId, topic: topic.trim(), platform }, { showErrorToast: false })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } finally { setLoading(false); }
  }
  async function copyAll() {
    if (!res) return;
    const all = [...res.broad, ...res.niche, ...res.local, ...res.branded].join(" ");
    await navigator.clipboard.writeText(all); setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20"><Hash className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-3xl font-bold text-white tracking-tight">Hashtag Researcher</h1>
          <p className="text-zinc-400 text-sm mt-1">A balanced mix by reach tier — not all giant tags nothing ranks for.</p></div>
      </div>
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Topic / niche</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(); }} placeholder="e.g. whale watching, eco tourism, Tasmania" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-[200px]">
          <Label>Platform</Label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
        </div>
        <Button onClick={run} disabled={loading || topic.trim().length < 2} className="gap-2 self-start">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Research</Button>
      </div>
      {loading && <div className="flex items-center justify-center py-12 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Researching…</div>}
      {res && (
        <div className="flex flex-col gap-4 mt-6">
          {res.note && <p className="text-sm text-zinc-400">{res.note}</p>}
          <div className="flex justify-end">
            <button onClick={copyAll} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">{copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy all</button>
          </div>
          {GROUPS.map(({ key, label }) => res[key].length > 0 && (
            <div key={key} className="surface-card p-4">
              <p className="label-section mb-2">{label} <span className="text-zinc-600">· {res[key].length}</span></p>
              <div className="flex flex-wrap gap-1.5">
                {res[key].map((t, i) => (
                  <button key={i} onClick={() => { void navigator.clipboard.writeText(t); }} title="Copy"
                    className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700">{t}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
