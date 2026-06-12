"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { CalendarClock, Check, X, Loader2 } from "lucide-react";

export interface PendingLeave {
  id: string; userName: string; start_date: string; end_date: string;
  leave_type: string | null; reason: string | null;
}

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Client-admin leave approvals, surfaced on the Team page (was buried in My Job). */
export function TeamLeaveApprovals({ initial }: { initial: PendingLeave[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function decide(id: string, status: "approved" | "declined") {
    setBusy(id);
    try {
      await api.patch(ROUTES.myJob.leave(), { id, status });
      setRequests((r) => r.filter((x) => x.id !== id));
      toast.success(status === "approved" ? "Leave approved." : "Leave declined.");
    } catch { /* api-client toasts */ } finally { setBusy(null); }
  }

  return (
    <div className="surface-card p-4 mb-6">
      <p className="label-section mb-3 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-amber-400" /> Leave requests
        <span className="text-zinc-500 font-normal">· {requests.length} pending</span>
      </p>
      <ul className="flex flex-col gap-2">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-100">
                <span className="font-medium">{r.userName}</span>
                <span className="text-zinc-400"> · {fmt(r.start_date)}{r.end_date !== r.start_date ? ` – ${fmt(r.end_date)}` : ""}</span>
                {r.leave_type && <span className="text-zinc-500"> · {r.leave_type}</span>}
              </p>
              {r.reason?.trim() && <p className="text-xs text-zinc-500 mt-0.5 truncate">{r.reason}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" className="h-7 gap-1 border-zinc-700" disabled={busy === r.id} onClick={() => decide(r.id, "declined")}>
                <X className="w-3 h-3" /> Decline
              </Button>
              <Button size="sm" className="h-7 gap-1" disabled={busy === r.id} onClick={() => decide(r.id, "approved")}>
                {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
