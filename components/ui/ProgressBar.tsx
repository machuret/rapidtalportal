import { cn } from "@/lib/utils";

/**
 * Progress / meter bar primitive. The fill width is the one genuinely dynamic
 * value that can't be a class, so it lives here once instead of being re-inlined
 * in every feature (coverage meters, mood bars, SOP/crawl progress, audit
 * scores). Callers set height + colour via the className props.
 *
 *   <ProgressBar value={pct} trackClassName="h-2.5 w-full"
 *                barClassName="bg-gradient-to-r from-blue-500 to-purple-500" />
 */
export function ProgressBar({
  value,
  min = 0,
  trackClassName,
  barClassName,
}: {
  value: number;        // 0–100
  min?: number;         // floor so a tiny value still shows a sliver
  trackClassName?: string;
  barClassName?: string;
}) {
  const pct = Math.max(min, Math.min(100, Math.round(value)));
  return (
    <div className={cn("rounded-full bg-zinc-800 overflow-hidden", trackClassName)}>
      <div className={cn("h-full rounded-full transition-all", barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}
