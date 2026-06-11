"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount } from "./shared";
import { Mails, Loader2, Sparkles } from "lucide-react";

interface Out { subject: string; preview: string; body: string }
const TONES = ["Friendly", "Professional", "Warm", "Playful", "Inspirational"];

export function NewsletterTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Friendly");
  const { result, loading, run } = useToolRun<Out>(ROUTES.tools.newsletter(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={Mails} tint="pink" title="Email Newsletter"
        subtitle="Subject, preview text and a ready-to-send body — in the client's voice." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>What&apos;s the newsletter about?</Label>
          <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4}
            placeholder="e.g. New summer tour times, a 10% returning-customer offer, and a staff spotlight."
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-[200px]">
          <Label>Tone</Label>
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <Button onClick={() => run({ clientId, topic: topic.trim(), tone })} disabled={loading || topic.trim().length < 3} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write it
        </Button>
      </div>

      {loading && <LoadingRow message="Writing…" />}

      {result && (
        <div className="surface-card p-5 mt-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="label-section">Newsletter</p>
            <CopyButton label="Copy all" text={`Subject: ${result.subject}\nPreview: ${result.preview}\n\n${result.body}`} />
          </div>
          <div className="border-b border-zinc-800 pb-3">
            <p className="text-sm text-zinc-100 font-medium">{result.subject}</p>
            <CharCount len={result.subject.length} limit={60} label="subject" />
            <p className="text-sm text-zinc-400 mt-1.5">{result.preview}</p>
            <CharCount len={result.preview.length} limit={90} label="preview" />
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{result.body}</p>
        </div>
      )}
    </div>
  );
}
