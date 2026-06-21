"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { MessageCircle, Loader2, Sparkles } from "lucide-react";

interface ReplyOption { style: string; text: string }
interface Out { replies: ReplyOption[] }

export function ReplyAssistantTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.replyAssistant(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={MessageCircle} tint="pink" title="Comment & DM Reply Assistant"
        subtitle="Paste what came in — get 3 on-brand reply options to choose from." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>The comment or DM you received</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
            placeholder="Paste the comment or DM here…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Context <span className="text-zinc-600 font-normal">(optional — anything the AI should know)</span></Label>
          <Input value={context} onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. they've asked twice already, we're fully booked Saturday…"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <Button onClick={() => run({ clientId, message: message.trim(), context: context.trim() || undefined })}
          disabled={loading || message.trim().length < 2} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Draft 3 replies
        </Button>
      </div>

      {loading && <LoadingRow message="Writing options…" />}

      {result && (
        <div className="flex flex-col gap-3 mt-6">
          {result.replies.map((r, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xs uppercase tracking-wide text-pink-400">{r.style || `Option ${i + 1}`}</span>
                <CopyButton text={r.text} />
              </div>
              <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{r.text}</p>
            </div>
          ))}
        </div>
      )}
      {feedback}
    </div>
  );
}
