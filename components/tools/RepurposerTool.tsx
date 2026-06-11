"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { Recycle, Loader2, Sparkles, Copy, Check, Briefcase, ThumbsUp, Camera, Clapperboard } from "lucide-react";

interface Repurposed {
  linkedin: string;
  facebook: string;
  instagram: string;
  scripts: { title: string; hook: string; script: string }[];
}

export function RepurposerTool({ clientId }: { clientId: string }) {
  const [content, setContent] = useState("");
  const [result, setResult] = useState<Repurposed | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    if (content.trim().length < 100 || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await api.post<Repurposed>(ROUTES.tools.repurposer(),
        { clientId, content: content.trim() }, { showErrorToast: false });
      setResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't repurpose the post.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  const Section = ({ id, icon: Icon, title, text }: { id: string; icon: typeof Briefcase; title: string; text: string }) => (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="label-section flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-pink-400" /> {title}</p>
        <button onClick={() => copy(id, text)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
          {copied === id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
        </button>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
          <Recycle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Post Repurposer</h1>
          <p className="text-zinc-400 text-sm mt-1">One blog post → LinkedIn, Facebook, Instagram + 3 short-video scripts.</p>
        </div>
      </div>

      <div className="surface-card p-5 flex flex-col gap-4">
        <FetchUrl clientId={clientId} onFetched={setContent} />
        <div className="flex flex-col gap-1.5">
          <Label>Blog post</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10}
            placeholder="Paste the full blog post here…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={run} disabled={loading || content.trim().length < 100} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Repurpose it
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Turning one post into a week of content…
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 mt-6">
          <Section id="li" icon={Briefcase} title="LinkedIn post" text={result.linkedin} />
          <Section id="fb" icon={ThumbsUp} title="Facebook post" text={result.facebook} />
          <Section id="ig" icon={Camera} title="Instagram caption" text={result.instagram} />

          {result.scripts.length > 0 && (
            <div className="surface-card p-4">
              <p className="label-section mb-3 flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5 text-pink-400" /> Short-video scripts</p>
              <div className="flex flex-col gap-4">
                {result.scripts.map((s, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-zinc-100">{s.title || `Script ${i + 1}`}</p>
                      <button onClick={() => copy(`s${i}`, `${s.hook}\n\n${s.script}`)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
                        {copied === `s${i}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                      </button>
                    </div>
                    <p className="text-xs text-pink-300 mb-1.5">Hook: {s.hook}</p>
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{s.script}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
