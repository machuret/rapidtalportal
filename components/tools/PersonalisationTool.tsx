"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { User, Loader2, Sparkles } from "lucide-react";

interface Out { lines: string[] }

export function PersonalisationTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [about, setAbout] = useState("");
  const { result, loading, run } = useToolRun<Out>(ROUTES.tools.personalisation(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={User} tint="cyan" title="Personalisation Line Writer"
        subtitle="Paste a prospect&apos;s website About text — get 3 custom opening lines that prove you did your homework." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Prospect&apos;s About / homepage text</Label>
          <Textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={8}
            placeholder="Paste the prospect's About page, homepage copy, or LinkedIn bio…"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, about: about.trim() })} disabled={loading || about.trim().length < 40} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write 3 lines
        </Button>
      </div>

      {loading && <LoadingRow message="Reading and writing custom lines…" />}

      {result && (
        <div className="flex flex-col gap-3 mt-6">
          {result.lines.map((line, i) => (
            <div key={i} className="surface-card p-4 flex items-start gap-3">
              <span className="text-xs text-zinc-600 tabular w-5 shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-sm text-zinc-100 leading-relaxed flex-1">{line}</p>
              <CopyButton text={line} label="" className="shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
