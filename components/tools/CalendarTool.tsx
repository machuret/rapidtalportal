"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarDays, Loader2, Sparkles, Copy, Check } from "lucide-react";

interface Day { day: number; format: string; idea: string; hook: string }

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

export function CalendarTool({ clientId }: { clientId: string }) {
  const [focus, setFocus] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [platform, setPlatform] = useState("Mixed");
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (loading) return;
    setLoading(true);
    setDays([]);
    try {
      const r = await api.post<{ days: Day[] }>(ROUTES.tools.calendar(), {
        clientId, focus: focus.trim() || undefined, tone,
        platform: platform === "Mixed" ? undefined : platform,
      }, { showErrorToast: false });
      setDays(r.days);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the calendar.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAll() {
    const text = days.map((d) => `Day ${d.day} · ${d.format}\nHook: ${d.hook}\nIdea: ${d.idea}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
          <CalendarDays className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">30-Day Content Calendar</h1>
          <p className="text-zinc-400 text-sm mt-1">A month of post ideas with hooks — varied formats and content pillars.</p>
        </div>
      </div>

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
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Platform</Label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate 30 days
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Planning the month…
        </div>
      )}

      {days.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="label-section">{days.length} days planned</p>
            <button onClick={copyAll} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy whole calendar
            </button>
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
