"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToolRun, ToolHeader, CopyButton, LoadingRow } from "./shared";
import { CalendarDays, Loader2, Sparkles } from "lucide-react";

interface Day { day: number; format: string; idea: string; hook: string }
interface Out { days: Day[] }

const TONES = ["Friendly", "Professional", "Playful", "Inspirational", "Bold"];
const PLATFORMS = ["Mixed", "Instagram", "Facebook", "LinkedIn", "TikTok"];

const FORMAT_CLS: Record<string, string> = {
  Reel: "text-pink-300 bg-pink-500/10",
  Carousel: "text-violet-300 bg-violet-500/10",
  Story: "text-amber-300 bg-amber-500/10",
  Post: "text-blue-300 bg-blue-500/10",
  Live: "text-red-300 bg-red-500/10",
  Poll: "text-green-300 bg-green-500/10",
};

export function CalendarTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [focus, setFocus] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [platform, setPlatform] = useState("Mixed");
  const { result, loading, run } = useToolRun<Out>(ROUTES.tools.calendar(), (initial ?? null) as Out | null);
  const days = result?.days ?? [];

  return (
    <div>
      <ToolHeader icon={CalendarDays} tint="pink" title="30-Day Content Calendar"
        subtitle="A month of post ideas with hooks — varied formats and content pillars." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Niche / monthly focus <span className="text-zinc-600 font-normal">(blank = use the client&apos;s services from Company DNA)</span></Label>
          <Input value={focus} onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Whale-watching season launch, gift vouchers push…"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Tone</Label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
              {TONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Platform</Label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <Button onClick={() => run({ clientId, focus: focus.trim() || undefined, tone, platform: platform === "Mixed" ? undefined : platform })}
          disabled={loading} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 30 days
        </Button>
      </div>

      {loading && <LoadingRow message="Planning the month…" />}

      {days.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="label-section">{days.length} days planned</p>
            <CopyButton label="Copy whole calendar"
              text={days.map((d) => `Day ${d.day} · ${d.format}\nHook: ${d.hook}\nIdea: ${d.idea}`).join("\n\n")} />
          </div>
          <div className="flex flex-col gap-2">
            {days.map((d) => (
              <div key={d.day} className="surface-card px-4 py-3 flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-bold flex items-center justify-center shrink-0 tabular">{d.day}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 ${FORMAT_CLS[d.format] ?? "text-zinc-300 bg-zinc-800"}`}>{d.format}</span>
                    <p className="text-sm font-medium text-zinc-100 truncate">{d.hook}</p>
                  </div>
                  <p className="text-sm text-zinc-400">{d.idea}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
