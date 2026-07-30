"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import type { ContentProject } from "@/types/content";

type PilotState = {
  enabled: boolean;
  workflow: {
    ideas_promoted: number;
    briefs_reaching_drafts: number;
    drafts_approved: number;
    revisions: number;
    validation_failures: number;
    abandoned_total: number;
  };
  analysis: {
    total_cost_usd: number;
    running: unknown[];
    failures: Array<{ id: string; analysis_kind: string; error_message: string | null }>;
  };
  voice_quality: {
    preference_rate: number | null;
    passing: boolean;
    decided_evaluations: number;
  };
};

const SCORE_FIELDS = [
  ["voice_accuracy", "Voice accuracy"],
  ["idea_usefulness", "Idea usefulness"],
  ["differentiation_quality", "Differentiation"],
  ["source_trust", "Trust in sources"],
  ["workflow_ease", "Ease of workflow"],
] as const;

export function ContentPilotPanel({
  clientId,
  projects,
}: {
  clientId: string;
  projects: ContentProject[];
}) {
  const [state, setState] = useState<PilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [notes, setNotes] = useState("");
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(SCORE_FIELDS.map(([field]) => [field, 4])),
  );
  const [submitting, setSubmitting] = useState(false);
  const reviewProjects = useMemo(
    () => projects.filter((project) => project.status === "approved" && project.current_piece_id),
    [projects],
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const reviewProject = useMemo(
    () => reviewProjects.find((project) => project.id === selectedProjectId) ??
      reviewProjects[0],
    [reviewProjects, selectedProjectId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await api.get<PilotState>(ROUTES.content.pilotForClient(clientId)));
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);
  if (loading || !state?.enabled) return null;

  const submitFeedback = async () => {
    if (!reviewProject) return;
    setSubmitting(true);
    try {
      await api.post(ROUTES.content.pilot(), {
        client_id: clientId,
        project_id: reviewProject.id,
        piece_id: reviewProject.current_piece_id,
        ...scores,
        notes,
      });
      toast.success("Pilot feedback saved");
      setShowFeedback(false);
      await load();
    } catch {
      // API client displays the specific error.
    } finally {
      setSubmitting(false);
    }
  };

  const metrics = [
    ["Ideas → briefs", state.workflow.ideas_promoted],
    ["Briefs → drafts", state.workflow.briefs_reaching_drafts],
    ["Approved", state.workflow.drafts_approved],
    ["Revisions", state.workflow.revisions],
    ["Validation issues", state.workflow.validation_failures],
    ["Stalled 7+ days", state.workflow.abandoned_total],
  ];
  return (
    <section data-testid="content-pilot-panel" className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
            <Activity className="h-4 w-4" /> Production pilot
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Workflow completion, recoverability, provider cost and explicit review only.
          </p>
        </div>
        <div className="flex gap-2">
          {reviewProject && (
            <Button size="sm" variant="outline" onClick={() => setShowFeedback((value) => !value)}>
              Review experience
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-label="Refresh pilot status" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <p className="text-lg font-semibold text-white">{value}</p>
            <p className="text-2xs text-zinc-500">{label}</p>
          </div>
        ))}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-lg font-semibold text-white">${state.analysis.total_cost_usd.toFixed(4)}</p>
          <p className="text-2xs text-zinc-500">Recorded model cost</p>
        </div>
      </div>
      {(state.analysis.failures.length > 0 || state.analysis.running.length > 0) && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {state.analysis.running.length} running · {state.analysis.failures.length} recent failed analyses.
          A failed run never replaces an approved profile or report.
        </p>
      )}
      {showFeedback && reviewProject && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <label className="text-sm font-medium text-white">
            Artifact to review
            <select
              aria-label="Artifact to review"
              value={reviewProject.id}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="mt-2 block h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
            >
              {reviewProjects.map((project) => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">
            {SCORE_FIELDS.map(([field, label]) => (
              <label key={field} className="text-xs text-zinc-400">
                {label}
                <select
                  value={scores[field]}
                  onChange={(event) => setScores((current) => ({ ...current, [field]: Number(event.target.value) }))}
                  className="mt-1 block h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-white"
                >
                  {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}/5</option>)}
                </select>
              </label>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What felt accurate, useful, trustworthy or difficult?"
            className="mt-3 min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm text-white"
          />
          <div className="mt-3 flex justify-end">
            <Button size="sm" disabled={submitting} onClick={() => void submitFeedback()}>
              {submitting ? "Saving…" : "Save review"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
