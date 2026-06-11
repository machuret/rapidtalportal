"use client";

/**
 * Holiday calendars — the client's public holidays (AU national + chosen state)
 * shown side by side with Philippine holidays, so both parties agree upfront
 * which apply. Data is curated (lib/my-job/holidays.ts), refreshed yearly.
 */
import { useState } from "react";
import { AU_REGIONS, PH_REGION, auRegion, HOLIDAY_YEAR, type HolidayRegion } from "@/lib/my-job/holidays";
import { CalendarDays } from "lucide-react";

function fmt(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Column({ region }: { region: HolidayRegion }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="surface-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
        <p className="font-semibold text-zinc-100 text-sm">{region.label}</p>
        <p className="text-[11px] text-zinc-500">{region.holidays.length} public holidays · {HOLIDAY_YEAR}</p>
      </div>
      <div className="divide-y divide-zinc-800/70 max-h-[420px] overflow-y-auto">
        {region.holidays.map((h) => {
          const past = h.date < today;
          return (
            <div key={h.date + h.name} className={past ? "px-4 py-2 opacity-45" : "px-4 py-2"}>
              <p className="text-xs text-zinc-400 tabular-nums">{fmt(h.date)}</p>
              <p className="text-sm text-zinc-100">{h.name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HolidayCalendars() {
  const [stateId, setStateId] = useState("nsw");
  const client = auRegion(stateId);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <CalendarDays className="w-4 h-4 text-zinc-500" />
          Compare the holidays that apply to each side.
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wide text-blue-400">Client state</label>
          <select value={stateId} onChange={(e) => setStateId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5">
            {AU_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Column region={client} />
        <Column region={PH_REGION} />
      </div>

      <p className="text-[11px] text-zinc-600 mt-3">
        Curated for {HOLIDAY_YEAR}. Movable dates (Easter, King&apos;s Birthday, Labour Day, and proclamation-based PH holidays) are refreshed each year.
      </p>
    </div>
  );
}
