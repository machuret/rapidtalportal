"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { Repeat, Loader2, Sparkles } from "lucide-react";

interface Touch { day: number; subject: string; body: string; purpose: string }
interface Out { touches: Touch[] }

export function FollowUpTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [email, setEmail] = useState("");
  const { result, loading, run, feedback } = useToolRun<Out>(ROUTES.tools.followUp(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={Repeat} tint="cyan" title="Follow-up Sequence Generator"
        subtitle="Paste the initial email — get a 4-touch follow-up sequence, each with a different angle." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Your initial email</Label>
          <Textarea value={email} onChange={(e) => setEmail(e.target.value)} rows={8}
            placeholder="Paste the first cold email you sent…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, email: email.trim() })} disabled={loading || email.trim().length < 20} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build the sequence
        </Button>
      </div>

      {loading && <LoadingRow message="Writing 4 follow-ups…" />}

      {result && (
        <div className="flex flex-col gap-3 mt-6">
          {result.touches.map((t, i) => (
            <div key={i} className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-cyan-400">Day {t.day}</span>
                  {t.purpose && <span className="text-[11px] text-zinc-500">· {t.purpose}</span>}
                </div>
                <CopyButton text={`Subject: ${t.subject}\n\n${t.body}`} />
              </div>
              <p className="text-sm text-zinc-100 font-medium mb-1.5">{t.subject}</p>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{t.body}</p>
            </div>
          ))}
        </div>
      )}
      {feedback}
    </div>
  );
}
