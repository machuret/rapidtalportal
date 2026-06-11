"use client";

/**
 * Timezone overlap widget — client working hours vs VA working hours on one
 * 24-hour strip (rendered in the VA's local time), with the overlap highlighted
 * so both sides can see when they're actually online together.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const ZONES = [
  "Asia/Manila",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Dubai",
  "Asia/Singapore",
  "UTC",
];

/** Minutes east of UTC for a zone right now (handles DST). */
function offsetMinutes(tz: string): number {
  const now = new Date();
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

function label(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const ampm = hh < 12 ? "am" : "pm";
  const disp = hh % 12 === 0 ? 12 : hh % 12;
  return `${disp}${ampm}`;
}

export function TimezoneOverlap({ defaultVaZone }: { defaultVaZone?: string | null }) {
  const [vaZone, setVaZone] = useState(defaultVaZone && ZONES.includes(defaultVaZone) ? defaultVaZone : "Asia/Manila");
  const [clientZone, setClientZone] = useState("Australia/Sydney");
  const workStart = 9;
  const workEnd = 17; // 9am–5pm both sides

  const { cells, overlapHours, clientStartInVa, clientEndInVa } = useMemo(() => {
    const diffH = (offsetMinutes(clientZone) - offsetMinutes(vaZone)) / 60; // client is this many hours ahead of VA
    // Client work window expressed on the VA's local 24h axis.
    const cStart = workStart - diffH;
    const cEnd = workEnd - diffH;
    const inRange = (h: number, s: number, e: number) => {
      // normalise into 0..24 on the VA axis, allowing wrap
      const x = ((h % 24) + 24) % 24;
      const ss = ((s % 24) + 24) % 24;
      const ee = ((e % 24) + 24) % 24;
      return ss <= ee ? x >= ss && x < ee : x >= ss || x < ee;
    };
    let overlap = 0;
    const cells = Array.from({ length: 24 }, (_, h) => {
      const va = inRange(h, workStart, workEnd);
      const cl = inRange(h, cStart, cEnd);
      if (va && cl) overlap++;
      return { h, va, cl, both: va && cl };
    });
    return { cells, overlapHours: overlap, clientStartInVa: cStart, clientEndInVa: cEnd };
  }, [vaZone, clientZone]);

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-zinc-100">Timezone overlap</h3>
        <span className={cn("text-xs font-semibold rounded-full px-2.5 py-0.5", overlapHours >= 3 ? "bg-green-500/15 text-green-300" : overlapHours > 0 ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300")}>
          {overlapHours}h overlap
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-purple-400">VA timezone</label>
          <select value={vaZone} onChange={(e) => setVaZone(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5">
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-blue-400">Client timezone</label>
          <select value={clientZone} onChange={(e) => setClientZone(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5">
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>

      {/* 24h strip on the VA's local axis */}
      <div className="flex gap-px rounded-lg overflow-hidden border border-zinc-800">
        {cells.map((c) => (
          <div key={c.h} title={`${label(c.h)} your time`}
            className={cn(
              "flex-1 h-9",
              c.both ? "bg-green-500/70" : c.va ? "bg-purple-500/40" : c.cl ? "bg-blue-500/40" : "bg-zinc-900",
            )} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
        <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500/60" /> Your hours (9–5)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/60" /> Client hours (9–5, = {label(Math.round(clientStartInVa))}–{label(Math.round(clientEndInVa))} your time)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/70" /> Overlap</span>
      </div>
    </div>
  );
}
