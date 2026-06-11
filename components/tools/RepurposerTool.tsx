"use client";

import { useState, type ComponentType } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount, DownloadButton } from "./shared";
import { Recycle, Loader2, Sparkles, Briefcase, ThumbsUp, Camera, Clapperboard } from "lucide-react";

interface Out {
  linkedin: string;
  facebook: string;
  instagram: string;
  scripts: { title: string; hook: string; script: string }[];
}

function packAsText(r: Out): string {
  return [
    "LINKEDIN\n" + r.linkedin,
    "FACEBOOK\n" + r.facebook,
    "INSTAGRAM\n" + r.instagram,
    ...r.scripts.map((s, i) => `SCRIPT ${i + 1}: ${s.title}\nHook: ${s.hook}\n${s.script}`),
  ].join("\n\n———\n\n");
}

function Section({ icon: Icon, title, text }: { icon: ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="label-section flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-pink-400" /> {title}</p>
        <CopyButton text={text} />
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export function RepurposerTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [content, setContent] = useState("");
  const { result, loading, run } = useToolRun<Out>(ROUTES.tools.repurposer(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={Recycle} tint="pink" title="Post Repurposer"
        subtitle="One blog post → LinkedIn, Facebook, Instagram + 3 short-video scripts." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <FetchUrl clientId={clientId} onFetched={setContent} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Blog post</Label>
            <CharCount len={content.length} limit={30000} />
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10}
            placeholder="Paste the full blog post here…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, content: content.trim() })} disabled={loading || content.trim().length < 100} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Repurpose it
        </Button>
      </div>

      {loading && <LoadingRow message="Turning one post into a week of content…" />}

      {result && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="flex items-center justify-end gap-4">
            <CopyButton text={packAsText(result)} label="Copy all" />
            <DownloadButton text={packAsText(result)} filename="repurposed-pack.md" />
          </div>
          <Section icon={Briefcase} title="LinkedIn post" text={result.linkedin} />
          <Section icon={ThumbsUp} title="Facebook post" text={result.facebook} />
          <Section icon={Camera} title="Instagram caption" text={result.instagram} />

          {result.scripts.length > 0 && (
            <div className="surface-card p-4">
              <p className="label-section mb-3 flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5 text-pink-400" /> Short-video scripts</p>
              <div className="flex flex-col gap-4">
                {result.scripts.map((s, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-zinc-100">{s.title || `Script ${i + 1}`}</p>
                      <CopyButton text={`${s.hook}\n\n${s.script}`} />
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
