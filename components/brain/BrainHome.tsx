import {
  Activity,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  CircleAlert,
  Gauge,
  Lightbulb,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LocalTime } from "@/components/ui/LocalTime";
import { BrainGrowthMap } from "@/components/brain/BrainGrowthMap";
import type {
  BrainReadiness,
  BrainReadinessDimensionKey,
  BrainReadinessStatus,
} from "@/lib/brain/readiness";

export interface BrainEventRow {
  id: string;
  kind: string;
  summary: string;
  created_at: string;
  meta?: Record<string, unknown>;
}

export interface BrainHomeProps {
  clientName: string;
  readiness: BrainReadiness;
  events: BrainEventRow[];
}

const STATUS_STYLE: Record<BrainReadinessStatus, string> = {
  strong: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  developing: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  limited: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  not_ready: "border-zinc-700 bg-zinc-800 text-zinc-400",
};

const DIMENSION_ICON: Record<BrainReadinessDimensionKey, typeof Brain> = {
  knowledge: BookOpen,
  voice: MessageSquareText,
  personalisation: Users,
  reliability: ShieldCheck,
  market: Radar,
};

const EVENT_ICON: Record<string, typeof Brain> = {
  style_approved: MessageSquareText,
  memory_approved: Lightbulb,
  memory_conflict: CircleAlert,
  gap_resolved: CheckCircle2,
  market_refreshed: Radar,
  sources_usable: BookOpen,
  evaluation_improved: Gauge,
};

function label(status: BrainReadinessStatus) {
  return status === "not_ready"
    ? "Not ready"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function ago(date: string) {
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function BrainHome({ clientName, readiness, events }: BrainHomeProps) {
  const contextual = readiness.contextual;

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
          <Brain className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Brain Readiness</h1>
          <p className="mt-1 text-sm text-zinc-400">
            What {clientName}&apos;s Brain can use today, where it is strong and what needs attention.
          </p>
        </div>
      </div>

      <BrainGrowthMap clientName={clientName} readiness={readiness} />

      <section className="surface-card mb-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="label-section">Overall readiness</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_STYLE[readiness.overallStatus]}`}>
                {label(readiness.overallStatus)}
              </span>
              <span className="text-xs text-zinc-500">
                Measured from current Vault, voice, learning, runtime and competitor data
              </span>
            </div>
          </div>
          <p className="max-w-lg text-sm leading-6 text-zinc-400">
            There is no hidden “Genius” score. Each capability is shown separately so one
            strong area cannot conceal a weak one.
          </p>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {readiness.dimensions.map((dimension) => {
          const Icon = DIMENSION_ICON[dimension.key];
          return (
            <section key={dimension.key} className="surface-card p-5">
              <div className="flex items-start justify-between gap-2">
                <Icon className="h-5 w-5 text-orange-400" />
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[dimension.status]}`}>
                  {label(dimension.status)}
                </span>
              </div>
              <h2 className="mt-3 text-sm font-semibold text-white">{dimension.label}</h2>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{dimension.score}%</p>
              <ProgressBar
                value={dimension.score}
                trackClassName="mt-2 h-1.5 w-full"
                barClassName="bg-gradient-to-r from-orange-500 to-amber-400"
              />
              <p className="mt-3 text-xs leading-5 text-zinc-400">{dimension.summary}</p>
              <ul className="mt-3 space-y-1.5">
                {dimension.evidence.slice(0, 3).map((item) => (
                  <li key={item} className="text-xs leading-4 text-zinc-500">• {item}</li>
                ))}
              </ul>
              {dimension.actions[0] && (
                <p className="mt-3 border-t border-zinc-800 pt-3 text-xs leading-4 text-amber-300/90">
                  Next: {dimension.actions[0]}
                </p>
              )}
            </section>
          );
        })}
      </div>

      <section className="surface-card mb-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Contextual readiness</h2>
            <p className="text-xs text-zinc-500">
              The exact output view becomes more specific by channel and topic.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <ReadinessFact label="Current task" value={contextual.channel ?? "All channels"} />
          <ReadinessFact label="Channel readiness" value={label(contextual.channelReadiness)} />
          <ReadinessFact label="Voice confidence" value={contextual.voiceConfidence.replace("_", " ")} />
          <ReadinessFact label="Vault coverage" value={contextual.vaultCoverage} />
          <ReadinessFact label="Relevant lessons" value={String(contextual.relevantLessons)} />
          <ReadinessFact
            label="Market intelligence"
            value={contextual.marketUpdatedAt
              ? <>Updated <LocalTime value={contextual.marketUpdatedAt} opts={{ day: "numeric", month: "short" }} /></>
              : "Not available"}
          />
        </dl>
      </section>

      <section className="surface-card p-6">
        <h2 className="text-lg font-semibold text-white">Brain activity</h2>
        <p className="mb-4 mt-1 text-xs text-zinc-500">
          Meaningful capability changes only—not routine database activity.
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No meaningful changes have been recorded yet. Approved styles, usable source
            batches, resolved gaps and refreshed intelligence will appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => {
              const Icon = EVENT_ICON[event.kind] ?? Activity;
              return (
                <li key={event.id} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                    <Icon className="h-4 w-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-200">{event.summary}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{ago(event.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-4 border-t border-zinc-800 pt-4 text-sm">
          <Link href="/brain-analytics" className="inline-flex items-center gap-1.5 text-orange-400 hover:text-orange-300">
            Review learning and evaluations <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link href="/company-dna" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white">
            Improve Company DNA <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function ReadinessFact({ label: factLabel, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <dt className="label-section">{factLabel}</dt>
      <dd className="mt-1 text-sm font-medium capitalize text-zinc-200">{value}</dd>
    </div>
  );
}
