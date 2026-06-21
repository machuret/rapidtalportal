import { Brain, Sparkles, BookOpen, ShieldCheck, TrendingUp, GraduationCap, FileText, Lightbulb, PartyPopper, Activity, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { BrainScore } from "@/lib/brain/score";

export interface BrainEventRow { id: string; kind: string; summary: string; created_at: string; meta?: Record<string, unknown> }
export interface BrainHomeProps {
  clientName: string;
  score: BrainScore;
  events: BrainEventRow[];
  trend: { score: number }[];
  lift: { baseline: number; recent: number; delta: number } | null;
}

const LEVEL_TINT: Record<string, string> = {
  Newborn: "text-zinc-300 border-zinc-600 bg-zinc-700/30",
  Learning: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  Sharp: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  Expert: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  Genius: "text-orange-200 border-orange-400/60 bg-orange-500/20",
};

const EVENT_ICON: Record<string, typeof Brain> = {
  learned: Lightbulb,
  filtered: ShieldCheck,
  read: FileText,
  level_up: PartyPopper,
  briefing: BookOpen,
  feedback: Activity,
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Circular score gauge — SVG attributes only (no inline styles), token colours. */
function ScoreRing({ score, level }: { score: number; level: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative w-[140px] h-[140px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="text-zinc-800" stroke="currentColor" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          className="text-orange-500" stroke="currentColor"
          strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-white tabular leading-none">{score}</span>
        <span className="text-2xs uppercase tracking-wider text-zinc-500 mt-1">{level}</span>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 120, h = 32, max = 100, min = 0;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / (max - min)) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BrainHome({ clientName, score, events, trend, lift }: BrainHomeProps) {
  const comp = score.components;
  const bars: { label: string; value: number; max: number }[] = [
    { label: "Knowledge", value: comp.knowledge, max: 25 },
    { label: "Learning", value: comp.learning, max: 25 },
    { label: "Accuracy", value: comp.accuracy, max: 35 },
    { label: "Freshness", value: comp.freshness, max: 15 },
  ];
  const f = score.facts;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Your Company Brain</h1>
          <p className="text-zinc-400 text-sm mt-1">How smart {clientName} has become — and what it&apos;s learning.</p>
        </div>
      </div>

      {/* Score + level + lift */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <section className="surface-card p-6 flex items-center gap-5">
          <ScoreRing score={score.score} level={score.level} />
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border ${LEVEL_TINT[score.level] ?? LEVEL_TINT.Newborn}`}>
              <GraduationCap className="w-3.5 h-3.5" /> {score.level}
            </span>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Brain Score blends what it knows, what it&apos;s learned, how accurate it is, and how fresh it stays.
            </p>
            {score.provisional && <p className="text-xs text-amber-400/90 mt-1.5">Still learning — accuracy firms up as you use it.</p>}
            {trend.length >= 2 && <div className="mt-3"><Sparkline points={trend.map((t) => t.score)} /></div>}
          </div>
        </section>

        {/* Lift */}
        <section className="surface-card p-6 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-orange-400" />
            <span className="label-section">Acceptance lift</span>
          </div>
          {lift ? (
            <>
              <p className="stat-value text-white">{lift.delta >= 0 ? "+" : ""}{lift.delta} pts</p>
              <p className="text-xs text-zinc-500 mt-1">From {lift.baseline}% at the start to {lift.recent}% now — the Brain is suggesting things you actually want.</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Approve or flag a few more suggestions and your improvement trend appears here.</p>
          )}
        </section>

        {/* This week */}
        <section className="surface-card p-6 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="label-section">This week</span>
          </div>
          <WeekSummary events={events} />
        </section>
      </div>

      {/* What it knows + component breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <section className="surface-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">What your Brain knows</h2>
          <div className="grid grid-cols-2 gap-4">
            <Tile icon={FileText} label="Documents" value={`${f.docsReady}`} sub={`${f.docsIndexed} AI-indexed`} />
            <Tile icon={ShieldCheck} label="Profile" value={`${f.profilePct}%`} sub="complete" />
            <Tile icon={Lightbulb} label="Lessons" value={`${f.activeLessons}`} sub="learned & active" />
            <Tile icon={Activity} label="Signals" value={`${f.signalsProcessed}`} sub="feedback processed" />
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">What makes up the score</h2>
          <div className="flex flex-col gap-3">
            {bars.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-20 shrink-0">{b.label}</span>
                <ProgressBar value={(b.value / b.max) * 100} min={2} trackClassName="h-2.5 flex-1" barClassName="bg-gradient-to-r from-orange-500 to-amber-500" />
                <span className="text-xs text-zinc-500 w-12 shrink-0 text-right tabular">{b.value}/{b.max}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Journal */}
      <section className="surface-card p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Brain journal</h2>
        <p className="text-xs text-zinc-500 mb-4">Everything your Brain has been doing for you, newest first.</p>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing yet. As you add documents, generate ideas and give feedback, your Brain&apos;s activity shows up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {events.map((e) => {
              const Icon = EVENT_ICON[e.kind] ?? Brain;
              return (
                <li key={e.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 leading-snug">{e.summary}</p>
                    <p className="text-xs text-zinc-600">{ago(e.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-zinc-800 text-sm">
          <Link href="/brain-analytics" className="inline-flex items-center gap-1.5 text-orange-400 hover:text-orange-300">
            See detailed analytics <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link href="/company-dna" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white">
            Improve the profile <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Brain; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="label-section">{label}</span>
      </div>
      <p className="stat-value text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
    </div>
  );
}

function WeekSummary({ events }: { events: BrainEventRow[] }) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recent = events.filter((e) => new Date(e.created_at).getTime() >= weekAgo);
  if (recent.length === 0) return <p className="text-sm text-zinc-500">A quiet week — generate ideas or add documents to wake it up.</p>;
  const learned = recent.filter((e) => e.kind === "learned").length;
  const filtered = recent.reduce((n, e) => n + (e.kind === "filtered" ? Number((e.meta as Record<string, unknown>)?.flagged ?? 0) : 0), 0);
  const parts: string[] = [];
  if (learned) parts.push(`learned ${learned} lesson${learned === 1 ? "" : "s"}`);
  if (filtered) parts.push(`filtered ${filtered} weak idea${filtered === 1 ? "" : "s"}`);
  return (
    <p className="text-sm text-zinc-300 leading-relaxed">
      {parts.length ? `Your Brain ${parts.join(" and ")} this week.` : `${recent.length} updates this week.`}
    </p>
  );
}
