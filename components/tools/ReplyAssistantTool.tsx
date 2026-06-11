"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface ReplyOption { style: string; text: string }

export function ReplyAssistantTool({ clientId }: { clientId: string }) {
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("");
  const [replies, setReplies] = useState<ReplyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function run() {
    if (message.trim().length < 2 || loading) return;
    setLoading(true);
    setReplies([]);
    try {
      const r = await api.post<{ replies: ReplyOption[] }>(ROUTES.tools.replyAssistant(),
        { clientId, message: message.trim(), context: context.trim() || undefined }, { showErrorToast: false });
      setReplies(r.replies);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft replies.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(i: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
          <MessageCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Comment &amp; DM Reply Assistant</h1>
          <p className="text-zinc-400 text-sm mt-1">Paste what came in — get 3 on-brand reply options to choose from.</p>
        </div>
      </div>

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
        <Button onClick={run} disabled={loading || message.trim().length < 2} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Draft 3 replies
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Writing options…
        </div>
      )}

      {replies.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {replies.map((r, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-wide text-pink-400">{r.style || `Option ${i + 1}`}</span>
                <button onClick={() => copy(i, r.text)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
                  {copied === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                </button>
              </div>
              <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
