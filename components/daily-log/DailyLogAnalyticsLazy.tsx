"use client";

import dynamic from "next/dynamic";
import type { AnalyticsEntry } from "@/types/daily-log";

/**
 * Lazy boundary for the analytics view. The underlying component pulls in
 * recharts (a heavy dependency); deferring it with ssr:false keeps it out of
 * this route's initial JS and loads it client-side once the page mounts. A
 * server component can't use ssr:false directly, so this thin client wrapper
 * owns the dynamic import.
 */
const DailyLogAnalytics = dynamic(
  () => import("./DailyLogAnalytics").then((m) => m.DailyLogAnalytics),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-56 rounded-lg bg-zinc-800" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-zinc-800" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-zinc-800" />
        <div className="h-72 rounded-xl bg-zinc-800" />
      </div>
    ),
  },
);

export function DailyLogAnalyticsLazy(props: { entries: AnalyticsEntry[]; userName: string }) {
  return <DailyLogAnalytics {...props} />;
}
