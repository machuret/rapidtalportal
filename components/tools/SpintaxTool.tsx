"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { Mail, Loader2, Sparkles } from "lucide-react";

interface Out { subject: string; preview: string; body: string }

export function SpintaxTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.spintax(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={Mail} tint="cyan" title="Spintax Email Builder"
        subtitle="A campaign brief → an on-brand cold email with spintax variations baked in, so every send is unique." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Offer / campaign brief</Label>
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5}
            placeholder="What are we offering, and why now? e.g. We help local clinics fill empty appointment slots with paid ads…"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Target audience <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={audience} onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. owners of dental practices in Sydney"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <Button onClick={() => run({ clientId, brief: brief.trim(), audience: audience.trim() || undefined })}
          disabled={loading || brief.trim().length < 20} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build the email
        </Button>
      </div>

      {loading && <LoadingRow message="Writing your spintax email…" />}

      {result && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="label-section">Subject (spintax)</p>
              <CopyButton text={result.subject} />
            </div>
            <p className="text-sm text-zinc-100 font-medium break-words">{result.subject}</p>
          </div>
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="label-section">Preview text</p>
              <CopyButton text={result.preview} />
            </div>
            <p className="text-sm text-zinc-300">{result.preview}</p>
          </div>
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="label-section">Body (spintax)</p>
              <CopyButton text={result.body} />
            </div>
            <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">{result.body}</p>
          </div>
          <p className="text-[11px] text-zinc-500">
            Spintax uses <span className="text-zinc-300">{"{option a|option b}"}</span> — your sending tool picks one per send. Paste straight into a spintax-aware sequencer.
          </p>
        </div>
      )}
      {feedback}
    </div>
  );
}
