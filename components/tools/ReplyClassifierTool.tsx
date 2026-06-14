"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { Inbox, Loader2, Sparkles } from "lucide-react";

interface Out { classification: string; label: string; reasoning: string; draft: string }

const TINT: Record<string, string> = {
  interested: "bg-green-500/15 text-green-300 border-green-500/30",
  objection: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  not_now: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  other: "bg-blue-500/15 text-blue-300 border-blue-500/30",
};

export function ReplyClassifierTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [reply, setReply] = useState("");
  const [context, setContext] = useState("");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.replyClassifier(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={Inbox} tint="cyan" title="Reply Classifier + Response Drafter"
        subtitle="Paste a prospect&apos;s reply — it classifies the intent and drafts your response." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>The prospect&apos;s reply</Label>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5}
            placeholder="Paste what they wrote back…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Context <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={context} onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. this is their second reply, they asked about pricing before…"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <Button onClick={() => run({ clientId, reply: reply.trim(), context: context.trim() || undefined })}
          disabled={loading || reply.trim().length < 2} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Classify & draft
        </Button>
      </div>

      {loading && <LoadingRow message="Reading the reply…" />}

      {result && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="surface-card p-4">
            <div className="flex items-center gap-3 mb-1.5">
              <span className={cn("text-xs font-semibold rounded-full border px-2.5 py-0.5", TINT[result.classification] ?? TINT.other)}>
                {result.label}
              </span>
              {result.reasoning && <p className="text-xs text-zinc-500">{result.reasoning}</p>}
            </div>
          </div>
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="label-section">Drafted response</p>
              <CopyButton text={result.draft} />
            </div>
            <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{result.draft}</p>
          </div>
        </div>
      )}
      {feedback}
    </div>
  );
}
