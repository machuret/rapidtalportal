"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mails, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Newsletter { subject: string; preview: string; body: string }
const TONES = ["Friendly", "Professional", "Warm", "Playful", "Inspirational"];

export function NewsletterTool({ clientId }: { clientId: string }) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [res, setRes] = useState<Newsletter | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    if (topic.trim().length < 3 || loading) return;
    setLoading(true); setRes(null);
    try {
      setRes(await api.post<Newsletter>(ROUTES.tools.newsletter(), { clientId, topic: topic.trim(), tone }, { showErrorToast: false }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed."); } finally { setLoading(false); }
  }
  async function copy(k: string, t: string) { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied((c) => c === k ? null : c), 1500); }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20"><Mails className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-3xl font-bold text-white tracking-tight">Email Newsletter</h1>
          <p className="text-zinc-400 text-sm mt-1">Subject, preview text and a ready-to-send body — in the client&apos;s voice.</p></div>
      </div>
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>What&apos;s the newsletter about?</Label>
          <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} placeholder="e.g. New summer tour times, a 10% returning-customer offer, and a staff spotlight." className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-[200px]">
          <Label>Tone</Label>
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">{TONES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <Button onClick={run} disabled={loading || topic.trim().length < 3} className="gap-2 self-start">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write it</Button>
      </div>
      {loading && <div className="flex items-center justify-center py-12 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Writing…</div>}
      {res && (
        <div className="surface-card p-5 mt-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="label-section">Newsletter</p>
            <button onClick={() => copy("all", `Subject: ${res.subject}\nPreview: ${res.preview}\n\n${res.body}`)} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">{copied === "all" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy all</button>
          </div>
          <div className="border-b border-zinc-800 pb-3">
            <p className="text-sm text-zinc-100 font-medium">{res.subject}</p>
            <p className={cn("text-[11px]", res.subject.length > 60 ? "text-red-400" : "text-zinc-500")}>{res.subject.length}/60 subject</p>
            <p className="text-sm text-zinc-400 mt-1.5">{res.preview}</p>
            <p className={cn("text-[11px]", res.preview.length > 90 ? "text-red-400" : "text-zinc-500")}>{res.preview.length}/90 preview</p>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{res.body}</p>
        </div>
      )}
    </div>
  );
}
