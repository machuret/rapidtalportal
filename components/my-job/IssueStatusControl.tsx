"use client";

/**
 * Status control for the super_admin Issues inbox — moves a raised issue
 * through open → in review → resolved via PATCH /api/my-job/issues.
 */
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Loader2 } from "lucide-react";

const STATUSES = ["open", "in_review", "resolved"] as const;

export function IssueStatusControl({ id, initial }: { id: string; initial: string }) {
  const [status, setStatus] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    if (saving || next === status) return;
    const prev = status;
    setStatus(next);
    setSaving(true);
    try {
      await api.patch(ROUTES.myJob.issues(), { id, status: next }, { showErrorToast: false });
      toast.success("Issue updated.");
    } catch (e) {
      setStatus(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
      <select value={status} onChange={(e) => change(e.target.value)} disabled={saving}
        className="bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-100 px-2 py-1">
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
    </div>
  );
}
