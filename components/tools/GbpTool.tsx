"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Post { body: string; cta: string; localAngle: string }
const LIMIT = 1500;

export function GbpTool({ clientId, companyName }: { clientId: string; companyName: string }) {
  const [topic, setTopic] = useState("");
  const [service, setService] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [hasContext, setHasContext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    if (topic.trim().length < 3 || loading) return;
    setLoading(true);
    setPosts([]);
    try {
      const r = await api.post<{ posts: Post[]; hasContext: boolean }>(ROUTES.tools.gbp(),
        { clientId, topic: topic.trim(), service: service.trim() || undefined }, { showErrorToast: false });
      setPosts(r.posts);
      setHasContext(r.hasContext);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate posts.");
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
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Google Business Profile Post</h1>
          <p className="text-zinc-400 text-sm mt-1">Local-SEO posts for {companyName} — give a topic, get three to choose from.</p>
        </div>
      </div>

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>This week&apos;s topic</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            placeholder="e.g. Summer whale-watching season is open" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Focus service <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Half-day boat tours"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <Button onClick={run} disabled={loading || topic.trim().length < 3} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 3 posts
        </Button>
      </div>

      {!loading && posts.length > 0 && !hasContext && (
        <p className="text-xs text-amber-400/80 mt-4">
          Tip: add this client&apos;s location and services in Company DNA for stronger local-SEO angles.
        </p>
      )}

      {loading && posts.length === 0 && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Writing posts…
        </div>
      )}

      {posts.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {posts.map((p, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-cyan-400">{p.localAngle || `Option ${i + 1}`}</span>
                <button onClick={() => copy(`p${i}`, p.body)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
                  {copied === `p${i}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                </button>
              </div>
              <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{p.body}</p>
              <div className="flex items-center gap-3 mt-2">
                {p.cta && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">CTA: {p.cta}</span>}
                <span className={cn("text-[11px] ml-auto", p.body.length > LIMIT ? "text-red-400" : "text-zinc-500")}>{p.body.length}/{LIMIT}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
