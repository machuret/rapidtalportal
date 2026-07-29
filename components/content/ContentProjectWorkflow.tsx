"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Circle,
  FileText,
  Lightbulb,
  Loader2,
  Radar,
  Save,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateContent } from "@/hooks/useContent";
import type { ContentPieceFull } from "@/hooks/useContent";
import {
  LENGTHS,
  TONES,
  type ContentBrief,
  type ContentEvidenceOption,
  type ContentPiece,
  type ContentProject,
  type ContentProjectStep,
} from "@/types/content";
import { HistoryTab } from "./HistoryTab";

const STEPS: Array<{ id: ContentProjectStep; label: string }> = [
  { id: "idea", label: "Idea" },
  { id: "brief", label: "Brief" },
  { id: "evidence", label: "Evidence" },
  { id: "generate", label: "Generate" },
  { id: "edit", label: "Edit" },
  { id: "validate", label: "Validate" },
  { id: "approve", label: "Approve" },
];

interface ValidationResult {
  valid: boolean;
  validated_at: string;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    warnings: string[];
  }>;
}

interface ContentProjectWorkflowProps {
  clientId: string;
  canApprove: boolean;
  project: ContentProject;
  onProjectChange: (project: ContentProject) => void;
  onClose: () => void;
  onRegenerateIdeas: () => void;
  onContentGenerated: (piece: ContentPiece) => void;
}

function isBrief(value: ContentProject["content_brief"]): value is ContentBrief {
  return (
    !!value &&
    typeof value === "object" &&
    "objective" in value &&
    typeof value.objective === "string" &&
    value.objective.trim().length > 0
  );
}

function ProjectProgress({ project }: { project: ContentProject }) {
  const currentIndex = project.current_step === "complete"
    ? STEPS.length
    : Math.max(0, STEPS.findIndex((step) => step.id === project.current_step));
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
      <ol className="flex min-w-3xl items-center">
        {STEPS.map((step, index) => {
          const complete = index < currentIndex || project.current_step === "complete";
          const current = index === currentIndex;
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                {complete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : current ? (
                  <Circle className="h-4 w-4 fill-purple-500 text-purple-400" />
                ) : (
                  <Circle className="h-4 w-4 text-zinc-700" />
                )}
                <span className={`text-xs font-medium ${current ? "text-white" : complete ? "text-zinc-300" : "text-zinc-600"}`}>
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`mx-3 h-px flex-1 ${index < currentIndex ? "bg-green-500/40" : "bg-zinc-800"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ContentProjectWorkflow({
  clientId,
  canApprove,
  project,
  onProjectChange,
  onClose,
  onRegenerateIdeas,
  onContentGenerated,
}: ContentProjectWorkflowProps) {
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<ContentEvidenceOption[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [history, setHistory] = useState<ContentPiece[]>(
    project.current_piece ? [project.current_piece] : [],
  );
  const { generate, isGenerating } = useGenerateContent();

  const initialBrief = isBrief(project.content_brief) ? project.content_brief : null;
  const [objective, setObjective] = useState(initialBrief?.objective ?? project.idea_snapshot.title);
  const [audience, setAudience] = useState(initialBrief?.audience ?? "");
  const [angle, setAngle] = useState(initialBrief?.angle ?? "");
  const [desiredFormat, setDesiredFormat] = useState(initialBrief?.desiredFormat ?? "");
  const [keyPoints, setKeyPoints] = useState((initialBrief?.keyPoints ?? []).join("\n"));
  const [callToAction, setCallToAction] = useState(initialBrief?.callToAction ?? "");
  const [tone, setTone] = useState(initialBrief?.tone ?? "professional");
  const [length, setLength] = useState<"short" | "medium" | "long">(initialBrief?.length ?? "medium");
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(
    new Set(project.vault_source_ids),
  );

  useEffect(() => {
    setHistory(project.current_piece ? [project.current_piece] : []);
  }, [project.current_piece]);

  const patchProject = useCallback(async (
    updates: Record<string, unknown>,
  ): Promise<ContentProject | null> => {
    setBusy(true);
    try {
      const updated = await api.patch<ContentProject>(ROUTES.content.projects(), {
        client_id: clientId,
        id: project.id,
        expected_updated_at: project.updated_at,
        ...updates,
      });
      onProjectChange(updated);
      return updated;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [clientId, onProjectChange, project.id, project.updated_at]);

  const loadProject = useCallback(async () => {
    const loaded = await api.get<ContentProject>(
      ROUTES.content.project(clientId, project.id),
    );
    onProjectChange(loaded);
    return loaded;
  }, [clientId, onProjectChange, project.id]);

  useEffect(() => {
    if (project.current_step !== "evidence") return;
    let cancelled = false;
    setEvidenceLoading(true);
    api.get<ContentEvidenceOption[]>(
      ROUTES.content.projectEvidence(clientId, project.id),
    )
      .then((rows) => {
        if (!cancelled) setEvidence(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, project.current_step, project.id]);

  const market = project.idea_snapshot.marketIntelligence ?? null;
  const styleSummary = Array.isArray(project.style_snapshot?.summary)
    ? project.style_snapshot.summary
    : [];

  const brief: ContentBrief = useMemo(() => ({
    version: 1,
    objective: objective.trim(),
    audience: audience.trim() || null,
    angle: angle.trim() || null,
    desiredFormat: desiredFormat.trim() || null,
    keyPoints: keyPoints.split("\n").map((value) => value.trim()).filter(Boolean),
    callToAction: callToAction.trim() || null,
    tone: tone as ContentBrief["tone"],
    length,
    mode: "new",
    marketIntelligence: market,
  }), [
    angle,
    audience,
    callToAction,
    desiredFormat,
    keyPoints,
    length,
    market,
    objective,
    tone,
  ]);

  const handleSaveBrief = useCallback(async () => {
    if (brief.objective.length < 3 || !brief.audience || !brief.angle || !brief.callToAction || !brief.desiredFormat) {
      toast.error("Complete the audience, objective, angle, format and CTA.");
      return;
    }
    await patchProject({ content_brief: brief, current_step: "evidence", status: "active" });
  }, [brief, patchProject]);

  const handleSaveEvidence = useCallback(async () => {
    await patchProject({
      vault_source_ids: Array.from(selectedSourceIds),
      current_step: "generate",
      status: "active",
    });
  }, [patchProject, selectedSourceIds]);

  const handleGenerate = useCallback(async () => {
    if (!isBrief(project.content_brief)) {
      toast.error("Complete and save the brief before generating.");
      return;
    }
    try {
      const data = await generate({
        clientId,
        projectId: project.id,
        vaultSourceIds: project.vault_source_ids,
        contentType: project.idea_snapshot.channel,
        title: project.title,
        brief: project.content_brief,
      });
      const piece: ContentPiece = {
        id: data.id,
        project_id: project.id,
        content_type: project.idea_snapshot.channel,
        title: project.title,
        body: data.body,
        content_brief: project.content_brief,
        source_references: data.sources ?? [],
        style_snapshot: data.styleSnapshot ?? project.style_snapshot,
        status: "draft",
        created_at: new Date().toISOString(),
      };
      onContentGenerated(piece);
      setHistory([piece]);
      await loadProject();
    } catch {
      // Generation hook surfaces the provider or quality error.
    }
  }, [clientId, generate, loadProject, onContentGenerated, project]);

  const runValidation = useCallback(async () => {
    if (!project.current_piece_id) return;
    setBusy(true);
    try {
      const result = await api.post<ValidationResult>(ROUTES.content.validate(), {
        client_id: clientId,
        project_id: project.id,
        piece_id: project.current_piece_id,
      });
      setValidation(result);
    } catch {
      setValidation(null);
    } finally {
      setBusy(false);
    }
  }, [clientId, project.current_piece_id, project.id]);

  useEffect(() => {
    if (project.current_step === "validate") void runValidation();
  }, [project.current_step, runValidation]);

  const handlePieceStatusChanged = useCallback(async (piece: ContentPieceFull) => {
    if (piece.status === "approved" || piece.status === "archived") {
      await loadProject();
    }
  }, [loadProject]);

  if (project.status === "rejected") {
    return (
      <div className="space-y-5">
        <Button variant="ghost" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Discover</Button>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <XCircle className="mx-auto h-8 w-8 text-red-400" />
          <h2 className="mt-3 text-lg font-semibold">Idea rejected</h2>
          <p className="mt-1 text-sm text-zinc-400">It remains recorded for future differentiation and learning.</p>
        </div>
      </div>
    );
  }

  if (project.status === "approved" || project.status === "archived") {
    return (
      <div className="space-y-5">
        <Button variant="ghost" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Content Studio</Button>
        <ProjectProgress project={project} />
        <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-5">
          <p className="flex items-center gap-2 font-semibold text-green-300">
            <CheckCircle2 className="h-5 w-5" />
            {project.status === "approved" ? "Approved content project" : "Archived content project"}
          </p>
          <p className="mt-1 text-sm text-zinc-400">The brief, evidence, style, draft and revision history remain connected below.</p>
        </div>
        {project.current_piece_id && (
          <HistoryTab
            history={history}
            clientId={clientId}
            canApprove={canApprove}
            onHistoryUpdate={setHistory}
            initialSelectedId={project.current_piece_id}
            onBackToWorkflow={onClose}
            onPieceStatusChanged={handlePieceStatusChanged}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Content Studio
        </Button>
        <div className="text-right">
          <p className="text-sm font-semibold text-white">{project.title}</p>
          <p className="text-xs text-zinc-500">Saved automatically · recoverable on any device</p>
        </div>
      </div>
      <ProjectProgress project={project} />

      {project.current_step === "idea" && (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-purple-300">
              <Lightbulb className="h-4 w-4" /> Selected idea
            </p>
            <h2 className="mt-3 text-xl font-semibold text-white">{project.idea_snapshot.title}</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="text-zinc-500">Why it is valuable</dt><dd className="mt-1 text-zinc-300">{project.idea_snapshot.rationale || "Aligned with the company’s current priorities and knowledge."}</dd></div>
              <div><dt className="text-zinc-500">How it is differentiated</dt><dd className="mt-1 text-zinc-300">{project.idea_snapshot.differentiation || "The final angle will be made specific during briefing."}</dd></div>
              <div><dt className="text-zinc-500">Evidence behind the idea</dt><dd className="mt-1 text-zinc-300">{project.idea_snapshot.evidenceSummary || "Company context and Vault signals informed this idea."}</dd></div>
            </dl>
          </section>
          <aside className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm font-medium text-white">What next?</p>
            <Button className="w-full justify-start" disabled={busy} onClick={() => patchProject({ current_step: "brief", status: "active" })}>
              <ArrowRight className="mr-2 h-4 w-4" /> Promote into a brief
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={async () => {
              const updated = await patchProject({ status: "saved" });
              if (updated) { toast.success("Idea saved for later."); onClose(); }
            }}>
              <Save className="mr-2 h-4 w-4" /> Save idea for later
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={async () => {
              const updated = await patchProject({ status: "saved" });
              if (updated) onRegenerateIdeas();
            }}>
              <Sparkles className="mr-2 h-4 w-4" /> Regenerate ideas
            </Button>
            <Button variant="ghost" className="w-full justify-start text-red-300" disabled={busy} onClick={() => patchProject({ status: "rejected" })}>
              <XCircle className="mr-2 h-4 w-4" /> Reject idea
            </Button>
          </aside>
        </div>
      )}

      {project.current_step === "brief" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-5">
            <p className="text-xs font-medium uppercase tracking-wide text-purple-300">Build the brief</p>
            <h2 className="mt-1 text-lg font-semibold">Turn the idea into one precise assignment</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="project-audience">Audience</Label><Input id="project-audience" className="mt-1.5 bg-zinc-950" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Who should care?" /></div>
            <div><Label>Channel</Label><div className="mt-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm capitalize text-zinc-300">{project.idea_snapshot.channel}</div></div>
            <div className="sm:col-span-2"><Label htmlFor="project-objective">Objective</Label><Textarea id="project-objective" className="mt-1.5 bg-zinc-950" value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} /></div>
            <div className="sm:col-span-2"><Label htmlFor="project-angle">Angle</Label><Textarea id="project-angle" className="mt-1.5 bg-zinc-950" value={angle} onChange={(event) => setAngle(event.target.value)} rows={3} placeholder="The specific point of view or story angle" /></div>
            <div><Label htmlFor="project-format">Desired format</Label><Input id="project-format" className="mt-1.5 bg-zinc-950" value={desiredFormat} onChange={(event) => setDesiredFormat(event.target.value)} placeholder="e.g. founder-led insight post" /></div>
            <div><Label htmlFor="project-cta">Call to action</Label><Input id="project-cta" className="mt-1.5 bg-zinc-950" value={callToAction} onChange={(event) => setCallToAction(event.target.value)} placeholder="What should the reader do?" /></div>
            <div className="sm:col-span-2"><Label htmlFor="project-points">Key points</Label><Textarea id="project-points" className="mt-1.5 bg-zinc-950" value={keyPoints} onChange={(event) => setKeyPoints(event.target.value)} rows={4} placeholder="One required point per line" /></div>
            <div><Label htmlFor="project-tone">Requested tone</Label><select id="project-tone" value={tone} onChange={(event) => setTone(event.target.value as ContentBrief["tone"])} className="mt-1.5 h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm">{TONES.map((item) => <option key={item} value={item.toLowerCase()}>{item}</option>)}</select></div>
            <div><Label>Length</Label><div className="mt-1.5 flex gap-2">{LENGTHS.map((item) => <button key={item.id} type="button" onClick={() => setLength(item.id)} className={`flex-1 rounded-md border px-2 py-2 text-xs ${length === item.id ? "border-purple-500 bg-purple-500/10 text-white" : "border-zinc-700 text-zinc-400"}`}>{item.label}</button>)}</div></div>
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => patchProject({ current_step: "idea" })}><ArrowLeft className="mr-2 h-4 w-4" /> Idea</Button>
            <Button disabled={busy} onClick={handleSaveBrief}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />} Review evidence</Button>
          </div>
        </section>
      )}

      {project.current_step === "evidence" && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-5 lg:col-span-2">
              <p className="flex items-center gap-2 font-medium text-blue-200"><BookOpenCheck className="h-4 w-4" /> Facts from the company Vault</p>
              <p className="mt-1 text-xs text-zinc-400">Only these sources may support factual claims in the draft.</p>
              <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                {evidenceLoading && <p className="py-8 text-center text-sm text-zinc-500">Loading factual Vault sources…</p>}
                {!evidenceLoading && evidence.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No ready factual sources are available. You can continue, but claims will be limited to Company DNA.</p>}
                {evidence.map((source) => {
                  const selected = selectedSourceIds.has(source.id);
                  return (
                    <button key={source.id} type="button" onClick={() => setSelectedSourceIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(source.id)) next.delete(source.id); else next.add(source.id);
                      return next;
                    })} className={`w-full rounded-lg border p-3 text-left ${selected ? "border-blue-400/50 bg-blue-500/10" : "border-zinc-800 bg-zinc-950"}`}>
                      <div className="flex items-start gap-2">
                        {selected ? <Check className="mt-0.5 h-4 w-4 text-blue-300" /> : <Circle className="mt-0.5 h-4 w-4 text-zinc-700" />}
                        <div><p className="text-sm font-medium text-zinc-200">{source.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{source.excerpt || "No summary available."}</p><span className="mt-1 inline-block text-2xs uppercase text-zinc-600">{source.category}</span></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            <div className="space-y-4">
              <section className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-purple-200"><ShieldCheck className="h-4 w-4" /> Style from owned examples</p>
                <p className="mt-1 text-xs text-zinc-500">Voice and formatting only—never factual support.</p>
                <ul className="mt-3 space-y-1.5">{styleSummary.slice(0, 8).map((rule) => <li key={rule} className="text-xs leading-5 text-zinc-400">• {rule}</li>)}</ul>
              </section>
              <section className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-orange-200"><Radar className="h-4 w-4" /> Market inspiration</p>
                <p className="mt-1 text-xs text-zinc-500">Competitor signals guide the angle. They can never substantiate company claims.</p>
                {project.competitor_signals.length ? <ul className="mt-3 space-y-2">{project.competitor_signals.slice(0, 5).map((signal) => <li key={`${signal.itemId}:${signal.captureVersionId}`} className="text-xs text-zinc-400">{signal.competitorName}: {signal.title}</li>)}</ul> : <p className="mt-3 text-xs text-zinc-600">No competitor signals attached.</p>}
              </section>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => patchProject({ current_step: "brief" })}><ArrowLeft className="mr-2 h-4 w-4" /> Brief</Button>
            <Button disabled={busy} onClick={handleSaveEvidence}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />} Continue with {selectedSourceIds.size} factual source{selectedSourceIds.size === 1 ? "" : "s"}</Button>
          </div>
        </div>
      )}

      {project.current_step === "generate" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-purple-300">Ready to generate</p>
          <h2 className="mt-2 text-xl font-semibold">One {project.idea_snapshot.channel} artifact</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-zinc-950 p-4"><p className="text-xs text-zinc-600">Brief</p><p className="mt-1 text-sm text-zinc-300">{isBrief(project.content_brief) ? project.content_brief.objective : "Missing"}</p></div>
            <div className="rounded-lg bg-blue-500/5 p-4"><p className="text-xs text-blue-300">Factual evidence</p><p className="mt-1 text-sm text-zinc-300">{project.vault_source_ids.length} selected Vault source{project.vault_source_ids.length === 1 ? "" : "s"}</p></div>
            <div className="rounded-lg bg-orange-500/5 p-4"><p className="text-xs text-orange-300">Market inspiration</p><p className="mt-1 text-sm text-zinc-300">{project.competitor_signals.length} competitor signal{project.competitor_signals.length === 1 ? "" : "s"}</p></div>
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => patchProject({ current_step: "evidence" })}><ArrowLeft className="mr-2 h-4 w-4" /> Evidence</Button>
            <Button size="lg" disabled={isGenerating} onClick={handleGenerate}>{isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{isGenerating ? "Writing and validating…" : "Generate draft"}</Button>
          </div>
        </section>
      )}

      {project.current_step === "edit" && project.current_piece_id && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
            <div><p className="font-medium text-purple-200">Edit and refine</p><p className="text-xs text-zinc-500">Inline edits and rewrites retain the project’s brief, evidence and style provenance.</p></div>
            <Button onClick={() => patchProject({ current_step: "validate" })}>Validate draft <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
          <HistoryTab history={history} clientId={clientId} canApprove={false} onHistoryUpdate={setHistory} initialSelectedId={project.current_piece_id} onBackToWorkflow={() => patchProject({ current_step: "generate" })} />
        </div>
      )}

      {project.current_step === "validate" && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium uppercase tracking-wide text-purple-300">Validation</p><h2 className="mt-1 text-lg font-semibold">Claims, voice, structure and hard rules</h2></div>
            <Button variant="outline" disabled={busy} onClick={runValidation}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Run again</Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(validation?.checks ?? []).map((check) => <div key={check.id} className={`rounded-lg border p-4 ${check.passed ? "border-green-500/20 bg-green-500/5" : "border-red-500/25 bg-red-500/5"}`}><p className={`flex items-center gap-2 text-sm font-medium ${check.passed ? "text-green-300" : "text-red-300"}`}>{check.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{check.label}</p>{check.warnings.map((warning) => <p key={warning} className="mt-2 text-xs leading-5 text-zinc-400">{warning}</p>)}</div>)}
            {!validation && <p className="col-span-2 py-8 text-center text-sm text-zinc-500">{busy ? "Checking the current saved draft…" : "Validation could not be loaded."}</p>}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => patchProject({ current_step: "edit" })}><ArrowLeft className="mr-2 h-4 w-4" /> Edit</Button>
            <Button disabled={!validation?.valid || busy} onClick={() => patchProject({ current_step: "approve" })}>Review for approval <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </section>
      )}

      {project.current_step === "approve" && project.current_piece_id && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
            <p className="flex items-center gap-2 font-medium text-green-300"><FileText className="h-4 w-4" /> Final approval</p>
            <p className="mt-1 text-xs text-zinc-400">{canApprove ? "Review the connected draft, then approve it below." : "A client approver must complete this final step."}</p>
          </div>
          <HistoryTab history={history} clientId={clientId} canApprove={canApprove} onHistoryUpdate={setHistory} initialSelectedId={project.current_piece_id} onBackToWorkflow={() => patchProject({ current_step: "validate" })} onPieceStatusChanged={handlePieceStatusChanged} />
        </div>
      )}
    </div>
  );
}
