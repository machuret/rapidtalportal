"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Sparkles, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";

type GapStatus = "open" | "planned" | "published" | "dismissed";
type QualityResponse = {
  index: { total: number; embedded: number; failed: number };
  coachFeedback: { windowDays: number; positive: number; negative: number; satisfaction: number | null };
  suggestions: Array<{
    id: string; coach_role: "client" | "va"; topic: string; detail: string;
    status: GapStatus; consented_at: string; created_at: string;
  }>;
  privacy: string;
};

export function BusinessLibraryQuality() {
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<QualityResponse>(ROUTES.admin.libraryQuality(), { showErrorToast: false }));
    } catch (error) {
      toast.error(errorMessage(error, "Library quality metrics could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: string, status: GapStatus) {
    if (updating) return;
    setUpdating(id);
    try {
      await api.patch(ROUTES.admin.libraryQuality(), { id, status }, { showErrorToast: false });
      setData((current) => current ? {
        ...current,
        suggestions: current.suggestions.map((item) => item.id === id ? { ...item, status } : item),
      } : current);
      toast.success("Library suggestion updated.");
    } catch (error) {
      toast.error(errorMessage(error, "The suggestion could not be updated."));
    } finally {
      setUpdating(null);
    }
  }

  if (loading && !data) {
    return <div className="surface-card mb-5 flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>;
  }
  if (!data) return null;
  const coverage = data.index.total ? Math.round((data.index.embedded / data.index.total) * 100) : 100;
  const open = data.suggestions.filter((item) => item.status === "open" || item.status === "planned");

  return (
    <section className="surface-card mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Library intelligence quality</h2>
          <p className="mt-1 text-xs text-zinc-500">Semantic coverage, aggregate Coach feedback and topics people explicitly asked to share.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5 border-zinc-700">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric icon={Sparkles} label="Semantic index" value={`${coverage}%`} note={`${data.index.embedded}/${data.index.total} chunks · ${data.index.failed} failed`} />
        <Metric icon={ThumbsUp} label={`Coach satisfaction · ${data.coachFeedback.windowDays}d`} value={data.coachFeedback.satisfaction === null ? "—" : `${data.coachFeedback.satisfaction}%`} note={`${data.coachFeedback.positive} positive · ${data.coachFeedback.negative} negative`} />
        <Metric icon={CheckCircle2} label="Consented gaps" value={String(open.length)} note={`${data.suggestions.length} total suggestions`} />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p className="text-xs leading-5 text-emerald-200/75">{data.privacy} Private questions, answers and feedback detail are never exposed here.</p>
      </div>
      {open.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Knowledge requests</p>
          <div className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {open.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200">{item.topic}</p>
                  {item.detail && <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>}
                  <p className="mt-1 text-3xs uppercase tracking-wide text-zinc-600">Suggested by a {item.coach_role === "client" ? "Client" : "VA"} · consent recorded</p>
                </div>
                <select value={item.status} disabled={updating === item.id} onChange={(event) => void updateStatus(item.id, event.target.value as GapStatus)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300">
                  <option value="open">Open</option><option value="planned">Planned</option><option value="published">Published</option><option value="dismissed">Dismissed</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Sparkles; label: string; value: string; note: string }) {
  return <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-orange-300" /><p className="text-xs text-zinc-500">{label}</p></div><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-0.5 text-xs text-zinc-600">{note}</p></div>;
}
