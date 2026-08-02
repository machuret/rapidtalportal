import { formatDate } from "@/lib/utils";

/**
 * "Xm/Yh/Zd ago" relative timestamp — the single version of what used to be
 * five near-identical `relTime` copies. `now` is injectable for tests.
 * Not hydration-safe on its own (depends on Date.now()); use
 * `components/ui/RelativeTime` in SSR-rendered markup.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}
