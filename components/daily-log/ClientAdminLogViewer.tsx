"use client";

import { useRouter } from "next/navigation";
import { Users, BarChart2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DailyLogStudio } from "@/components/daily-log/DailyLogStudio";
import type { DailyLog, DailyLogNote, Mood } from "@/types/daily-log";

interface Employee {
  id: string;
  full_name: string | null;
  email: string;
}

interface Props {
  employees: Employee[];
  selectedEmployeeId: string | null;
  initialLog: DailyLog | null;
  initialNotes: DailyLogNote[];
  initialHistory: { log_date: string; mood: Mood | null }[];
  today: string; // server-computed; forwarded so DailyLogStudio hydrates deterministically
}

export function ClientAdminLogViewer({
  employees,
  selectedEmployeeId,
  initialLog,
  initialNotes,
  initialHistory,
  today,
}: Props) {
  const router = useRouter();

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/daily-log?employee=${e.target.value}`);
  }

  const selected = employees.find(e => e.id === selectedEmployeeId);

  return (
    <div className="flex flex-col gap-6">
      {/* Employee selector */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900">
        <Users className="w-5 h-5 text-zinc-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-1">Viewing log for</p>
          {employees.length === 0 ? (
            <p className="text-sm text-zinc-400">No VA employees found in this client account.</p>
          ) : (
            <select
              value={selectedEmployeeId ?? ""}
              onChange={handleSelect}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-medium focus:outline-none focus:border-blue-500"
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name ?? emp.email}
                </option>
              ))}
            </select>
          )}
        </div>
        {selected && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs text-zinc-500">Read-only view</p>
              <p className="text-xs text-zinc-400 truncate max-w-[140px]">{selected.email}</p>
            </div>
            <Link href={`/daily-log/analytics?employee=${selected.id}`}>
              <Button variant="outline" size="sm" className="border-zinc-700 text-xs h-8">
                <BarChart2 className="w-3.5 h-3.5 mr-1.5" />Analytics
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Log content — read-only for admin */}
      {selectedEmployeeId && employees.length > 0 ? (
        <DailyLogStudio
          initialLog={initialLog}
          initialNotes={initialNotes}
          initialHistory={initialHistory}
          today={today}
          readOnly
          viewingUserId={selectedEmployeeId}
        />
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
          <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400">No employees to display.</p>
        </div>
      )}
    </div>
  );
}
