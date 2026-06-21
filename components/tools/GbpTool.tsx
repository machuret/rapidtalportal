"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { MapPin, Loader2, Sparkles } from "lucide-react";

interface Post { body: string; cta: string; localAngle: string }
interface Out { posts: Post[]; hasContext: boolean }
const LIMIT = 1500;

export function GbpTool({ clientId, companyName, initial }: { clientId: string; companyName: string; initial?: unknown }) {
  const [topic, setTopic] = useState("");
  const [service, setService] = useState("");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.gbp(), (initial ?? null) as Out | null);

  const go = () => run({ clientId, topic: topic.trim(), service: service.trim() || undefined });

  return (
    <div>
      <ToolHeader icon={MapPin} title="Google Business Profile Post"
        subtitle={`Local-SEO posts for ${companyName} — give a topic, get three to choose from.`} />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>This week&apos;s topic</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder="e.g. Summer whale-watching season is open" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Focus service <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Half-day boat tours"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <Button onClick={go} disabled={loading || topic.trim().length < 3} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 3 posts
        </Button>
      </div>

      {loading && <LoadingRow message="Writing posts…" />}

      {result && (
        <div className="flex flex-col gap-3 mt-6">
          {result.posts.map((p, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xs uppercase tracking-wide text-cyan-400">{p.localAngle || `Option ${i + 1}`}</span>
                <CopyButton text={p.body} />
              </div>
              <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{p.body}</p>
              <div className="flex items-center gap-3 mt-2">
                {p.cta && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">CTA: {p.cta}</span>}
                <span className={cn("text-2xs ml-auto", p.body.length > LIMIT ? "text-red-400" : "text-zinc-500")}>{p.body.length}/{LIMIT}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {feedback}
    </div>
  );
}
