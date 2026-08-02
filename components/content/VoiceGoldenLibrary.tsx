"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, ExternalLink, FlaskConical, Library, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import {
  STYLE_ANALYSIS_CHANNELS,
  VOICE_GOLDENS_UPDATED_EVENT,
  type StyleAnalysisChannel,
} from "@/lib/content/style-analysis";
import type { BlindVoiceEvaluation, ContentGoldenExample } from "@/lib/content/voice-calibration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  clientId: string;
  canEdit: boolean;
}

const CHANNEL_LABELS: Record<StyleAnalysisChannel, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X / Twitter",
  email: "Email",
  blog: "Blog",
  newsletter: "Newsletter",
};

function lines(value: string, max: number): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, max);
}

export function VoiceGoldenLibrary({ clientId, canEdit }: Props) {
  const [examples, setExamples] = useState<ContentGoldenExample[]>([]);
  const [channel, setChannel] = useState<StyleAnalysisChannel>("linkedin");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [contentType, setContentType] = useState("educational");
  const [voiceTraits, setVoiceTraits] = useState("");
  const [structuralTraits, setStructuralTraits] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [notes, setNotes] = useState("");
  const [representative, setRepresentative] = useState(true);
  const [permission, setPermission] = useState(false);
  const [editing, setEditing] = useState<ContentGoldenExample | null>(null);
  const [evaluations, setEvaluations] = useState<BlindVoiceEvaluation[]>([]);
  const [evaluationTitle, setEvaluationTitle] = useState("");
  const [evaluationObjective, setEvaluationObjective] = useState("");
  const [evaluationAudience, setEvaluationAudience] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [loadedExamples, loadedEvaluations] = await Promise.all([
        api.get<ContentGoldenExample[]>(
          ROUTES.content.goldensForClient(clientId),
          { showErrorToast: false },
        ),
        api.get<BlindVoiceEvaluation[]>(
          ROUTES.content.voiceEvaluationsForClient(clientId),
          { showErrorToast: false },
        ),
      ]);
      setExamples(loadedExamples);
      setEvaluations(loadedEvaluations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Golden examples could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  // Quick-add (IdealPostQuickAdd) and this library's own saves broadcast the
  // same event StyleAnalysisManager listens to — reload in place so new
  // goldens appear without remounting (a remount would wipe the open form).
  useEffect(() => {
    function refreshAfterGoldensUpdated(event: Event) {
      const updatedClientId = (event as CustomEvent<{ clientId?: string }>).detail?.clientId;
      if (updatedClientId === clientId) void load(true);
    }
    window.addEventListener(VOICE_GOLDENS_UPDATED_EVENT, refreshAfterGoldensUpdated);
    return () => window.removeEventListener(VOICE_GOLDENS_UPDATED_EVENT, refreshAfterGoldensUpdated);
  }, [clientId, load]);

  const channelExamples = useMemo(
    () => examples.filter((example) => example.channel === channel),
    [channel, examples],
  );
  const approvedCount = channelExamples.filter((example) =>
    example.status === "approved" && example.evaluation_permission).length;
  const channelEvaluations = evaluations.filter((evaluation) => evaluation.channel === channel);
  const reviewedEvaluations = channelEvaluations.filter((evaluation) => evaluation.status === "reviewed");
  const decidedEvaluations = reviewedEvaluations.filter((evaluation) => evaluation.revealed_winner !== "tie");
  const conditionedPreferenceRate = decidedEvaluations.length
    ? Math.round((decidedEvaluations.filter((evaluation) => evaluation.revealed_winner === "conditioned").length /
      decidedEvaluations.length) * 100)
    : null;
  const safetyEvaluations = channelEvaluations.filter((evaluation) =>
    evaluation.status === "ready" || evaluation.status === "reviewed");
  const hardRulePassRate = safetyEvaluations.length
    ? Math.round((safetyEvaluations.filter((evaluation) => {
      const automated = evaluation.automated_evaluation as {
        variant_a?: { hardRulesPass?: boolean };
        variant_b?: { hardRulesPass?: boolean };
      };
      return automated.variant_a?.hardRulesPass === true && automated.variant_b?.hardRulesPass === true;
    }).length / safetyEvaluations.length) * 100)
    : null;

  function resetForm() {
    setTitle("");
    setBody("");
    setSourceUrl("");
    setPublishedAt("");
    setContentType("educational");
    setVoiceTraits("");
    setStructuralTraits("");
    setVocabulary("");
    setNotes("");
    setRepresentative(true);
    setPermission(false);
    setEditing(null);
    setShowForm(false);
  }

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent(VOICE_GOLDENS_UPDATED_EVENT, {
      detail: { clientId },
    }));
  }

  function editExample(example: ContentGoldenExample) {
    setEditing(example);
    setChannel(example.channel);
    setTitle(example.title);
    setBody(example.body);
    setSourceUrl(example.source_url ?? "");
    setPublishedAt(example.published_at ? new Date(example.published_at).toISOString().slice(0, 16) : "");
    setContentType(example.content_type);
    setVoiceTraits(example.voice_traits.join("\n"));
    setStructuralTraits(example.structural_traits.join("\n"));
    setVocabulary(example.vocabulary_preferences.join("\n"));
    setNotes(example.admin_notes ?? "");
    setRepresentative(example.represents_brand_strongly);
    setPermission(example.evaluation_permission);
    setShowForm(true);
  }

  async function saveExample() {
    setWorking(true);
    const wasEditing = Boolean(editing);
    try {
      const payload = {
        client_id: clientId,
        channel,
        title,
        body,
        source_url: sourceUrl.trim() || null,
        published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
        content_type: contentType,
        represents_brand_strongly: representative,
        voice_traits: lines(voiceTraits, 20),
        structural_traits: lines(structuralTraits, 20),
        vocabulary_preferences: lines(vocabulary, 30),
        admin_notes: notes.trim() || null,
        evaluation_permission: permission,
      };
      if (editing) {
        await api.patch(ROUTES.content.goldens(), {
          ...payload,
          id: editing.id,
          expected_updated_at: editing.updated_at,
        }, { showErrorToast: false });
      } else {
        await api.post(ROUTES.content.goldens(), payload, { showErrorToast: false });
      }
      resetForm();
      await load();
      notifyChanged();
      toast.success(wasEditing ? "Golden example updated." : "Golden example added for review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Golden example could not be added.");
    } finally {
      setWorking(false);
    }
  }

  async function setStatus(example: ContentGoldenExample, status: "approved" | "archived") {
    setWorking(true);
    try {
      await api.patch(ROUTES.content.goldens(), {
        client_id: clientId,
        id: example.id,
        status,
        evaluation_permission: example.evaluation_permission,
        expected_updated_at: example.updated_at,
      }, { showErrorToast: false });
      await load();
      notifyChanged();
      toast.success(status === "approved" ? "Golden approved for blind evaluation." : "Golden archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Golden example could not be updated.");
    } finally {
      setWorking(false);
    }
  }

  async function runEvaluation() {
    setWorking(true);
    try {
      await api.post(ROUTES.content.voiceEvaluations(), {
        client_id: clientId,
        channel,
        title: evaluationTitle,
        objective: evaluationObjective,
        audience: evaluationAudience,
        tone: "professional",
        length: "medium",
      }, { showErrorToast: false });
      setEvaluationTitle("");
      setEvaluationObjective("");
      setEvaluationAudience("");
      await load();
      toast.success("Blind A/B voice evaluation is ready for review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice evaluation could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  async function reviewEvaluation(evaluation: BlindVoiceEvaluation, preferred: "a" | "b" | "tie") {
    setWorking(true);
    try {
      await api.patch(ROUTES.content.voiceEvaluations(), {
        client_id: clientId,
        id: evaluation.id,
        preferred_variant: preferred,
        reviewer_notes: reviewNotes[evaluation.id] ?? "",
      }, { showErrorToast: false });
      await load();
      toast.success("Blind preference recorded. The assignment is now revealed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The blind review could not be recorded.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/15 p-2"><Library className="h-5 w-5 text-blue-300" /></div>
          <div>
            <h2 className="text-sm font-semibold text-white">Real-client golden library</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
              Approved published examples evaluate whether generated writing resembles the client.
              They are isolated from factual Vault evidence and never substantiate claims.
            </p>
          </div>
        </div>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => {
            if (showForm) resetForm();
            else setShowForm(true);
          }}>
            <Plus /> Add published example
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Read-only
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {STYLE_ANALYSIS_CHANNELS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setChannel(item)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              channel === item
                ? "border-blue-400/60 bg-blue-500/20 text-blue-100"
                : "border-zinc-700 text-zinc-400"
            }`}
          >
            {CHANNEL_LABELS[item]} · {examples.filter((example) => example.channel === item && example.status === "approved").length}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-xs text-zinc-400">
          {approvedCount >= 5
            ? `${approvedCount} approved, permissioned examples — adequately sampled for evaluation.`
            : `${approvedCount}/5 approved, permissioned examples — collect ${5 - approvedCount} more for a reliable channel baseline.`}
        </p>
      </div>

      {showForm && canEdit && (
        <div className="mt-4 space-y-4 rounded-xl border border-zinc-700 bg-zinc-950/60 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><Label>Published title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5" /></label>
            <label><Label>Content type</Label><Input value={contentType} onChange={(event) => setContentType(event.target.value)} className="mt-1.5" placeholder="founder-led, educational, promotional…" /></label>
            <label><Label>Source URL</Label><Input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className="mt-1.5" /></label>
            <label><Label>Published date</Label><Input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="mt-1.5" /></label>
          </div>
          <label className="block"><Label>Original published content</Label><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} className="mt-1.5" /></label>
          <div className="grid gap-4 lg:grid-cols-3">
            <label><Label>Voice traits</Label><Textarea value={voiceTraits} onChange={(event) => setVoiceTraits(event.target.value)} rows={4} className="mt-1.5" placeholder="One trait per line" /></label>
            <label><Label>Structural traits</Label><Textarea value={structuralTraits} onChange={(event) => setStructuralTraits(event.target.value)} rows={4} className="mt-1.5" placeholder="One trait per line" /></label>
            <label><Label>Vocabulary preferences</Label><Textarea value={vocabulary} onChange={(event) => setVocabulary(event.target.value)} rows={4} className="mt-1.5" placeholder="One preference per line" /></label>
          </div>
          <label className="block"><Label>Admin notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1.5" /></label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={representative} onChange={(event) => setRepresentative(event.target.checked)} />
            This strongly represents the client’s brand.
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} />
            The client permits this content to be used for private voice evaluation.
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button disabled={working || title.trim().length < 1 || body.trim().length < 40} onClick={() => void saveExample()}>
              {working && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Save proposed golden"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading goldens…</div>
      ) : channelExamples.length ? (
        <div className="mt-4 space-y-2">
          {channelExamples.map((example) => (
            <article key={example.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{example.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {example.content_type} · {example.represents_brand_strongly ? "strong brand example" : "supporting example"}
                    {" · "}{example.evaluation_permission ? "evaluation permitted" : "permission missing"}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs ${
                  example.status === "approved"
                    ? "border-emerald-500/30 text-emerald-300"
                    : "border-amber-500/30 text-amber-300"
                }`}>{example.status}</span>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{example.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {example.source_url && (
                  <a href={example.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-300">
                    <ExternalLink className="h-3.5 w-3.5" /> Published source
                  </a>
                )}
                {canEdit && example.status === "proposed" && (
                  <Button size="sm" disabled={working || !example.evaluation_permission} onClick={() => void setStatus(example, "approved")}>
                    <CheckCircle2 /> Approve golden
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="outline" disabled={working} onClick={() => editExample(example)}>
                    <Pencil /> Edit
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" disabled={working} onClick={() => void setStatus(example, "archived")}>
                    <Archive /> Archive
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-700 py-8 text-center text-sm text-zinc-500">
          No {CHANNEL_LABELS[channel]} goldens yet.
        </p>
      )}

      <div className="mt-6 border-t border-blue-500/20 pt-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-500/15 p-2"><FlaskConical className="h-5 w-5 text-purple-300" /></div>
          <div>
            <h3 className="text-sm font-semibold text-white">Blind voice calibration</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
              Generate the same brief with and without the approved channel analysis. Reviewers see anonymous A/B drafts;
              the system reveals which version was style-conditioned only after a preference is submitted.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-2xs uppercase text-zinc-600">Approved goldens</p>
            <p className="mt-1 text-lg font-semibold text-zinc-200">{approvedCount}/5+</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-2xs uppercase text-zinc-600">Blind reviews</p>
            <p className="mt-1 text-lg font-semibold text-zinc-200">{reviewedEvaluations.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-2xs uppercase text-zinc-600">Conditioned preferred</p>
            <p className={`mt-1 text-lg font-semibold ${
              conditionedPreferenceRate !== null && conditionedPreferenceRate >= 80 ? "text-emerald-300" : "text-zinc-200"
            }`}>{conditionedPreferenceRate === null ? "—" : `${conditionedPreferenceRate}%`}</p>
            <p className="text-2xs text-zinc-600">Target ≥80%</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-2xs uppercase text-zinc-600">Hard-rule pass</p>
            <p className={`mt-1 text-lg font-semibold ${
              hardRulePassRate === 100 ? "text-emerald-300" : hardRulePassRate === null ? "text-zinc-200" : "text-red-300"
            }`}>{hardRulePassRate === null ? "—" : `${hardRulePassRate}%`}</p>
            <p className="text-2xs text-zinc-600">Target 100%</p>
          </div>
        </div>

        {canEdit && (
          <div className="mt-4 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 lg:grid-cols-3">
            <label><Label>Working title</Label><Input value={evaluationTitle} onChange={(event) => setEvaluationTitle(event.target.value)} className="mt-1.5" placeholder="A concrete content assignment" /></label>
            <label><Label>Objective</Label><Input value={evaluationObjective} onChange={(event) => setEvaluationObjective(event.target.value)} className="mt-1.5" placeholder="What this draft should achieve" /></label>
            <label><Label>Audience</Label><Input value={evaluationAudience} onChange={(event) => setEvaluationAudience(event.target.value)} className="mt-1.5" placeholder="Who should care" /></label>
            <div className="lg:col-span-3 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">Requires five approved, representative and permissioned {CHANNEL_LABELS[channel]} goldens plus an approved style profile.</p>
              <Button
                disabled={working || approvedCount < 5 || evaluationTitle.trim().length < 3 || evaluationObjective.trim().length < 10 || evaluationAudience.trim().length < 2}
                onClick={() => void runEvaluation()}
              >
                {working ? <Loader2 className="animate-spin" /> : <FlaskConical />} Run blind comparison
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {channelEvaluations.slice(0, 10).map((evaluation) => {
            const automated = evaluation.automated_evaluation as {
              variant_a?: { hardRulesPass?: boolean; copyingRisk?: number; genericnessRisk?: number; modelJudge?: { voiceTraitAdherence?: number } | null };
              variant_b?: { hardRulesPass?: boolean; copyingRisk?: number; genericnessRisk?: number; modelJudge?: { voiceTraitAdherence?: number } | null };
            };
            return (
              <article key={evaluation.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">{String(evaluation.brief.title ?? evaluation.brief.objective ?? "Voice comparison")}</p>
                  <span className={`rounded-full border px-2 py-1 text-xs capitalize ${
                    evaluation.status === "failed" ? "border-red-500/30 text-red-300" : "border-zinc-700 text-zinc-400"
                  }`}>{evaluation.status}</span>
                </div>
                {evaluation.status === "failed" && evaluation.error && (
                  <p className="mt-2 text-xs text-red-300">{evaluation.error}</p>
                )}
                {evaluation.variant_a && evaluation.variant_b && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {(["a", "b"] as const).map((variant) => {
                      const metrics = automated[`variant_${variant}`];
                      const assignment = evaluation.revealed_assignment?.[`variant_${variant}`];
                      return (
                        <div key={variant} className="rounded-lg border border-zinc-800 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">Variant {variant.toUpperCase()}</p>
                            {assignment && <span className="text-xs capitalize text-zinc-500">{assignment}</span>}
                          </div>
                          <p className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">
                            {variant === "a" ? evaluation.variant_a : evaluation.variant_b}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-2xs text-zinc-500">
                            <span>Voice {metrics?.modelJudge?.voiceTraitAdherence ?? "—"}/100</span>
                            <span>Genericness risk {metrics?.genericnessRisk ?? "—"}%</span>
                            <span>Copy risk {metrics?.copyingRisk ?? "—"}%</span>
                            <span className={metrics?.hardRulesPass ? "text-emerald-400" : "text-red-400"}>
                              Hard rules {metrics?.hardRulesPass ? "pass" : "review"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {canEdit && evaluation.status === "ready" && (
                  <div className="mt-4 rounded-lg border border-zinc-800 p-3">
                    <Label>Reviewer notes (optional)</Label>
                    <Textarea
                      rows={2}
                      value={reviewNotes[evaluation.id] ?? ""}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [evaluation.id]: event.target.value }))}
                      className="mt-1.5"
                      placeholder="What made one version sound more like the client?"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" disabled={working} onClick={() => void reviewEvaluation(evaluation, "a")}>Prefer A</Button>
                      <Button size="sm" disabled={working} onClick={() => void reviewEvaluation(evaluation, "b")}>Prefer B</Button>
                      <Button size="sm" variant="outline" disabled={working} onClick={() => void reviewEvaluation(evaluation, "tie")}>No preference</Button>
                    </div>
                  </div>
                )}
                {evaluation.status === "reviewed" && (
                  <p className="mt-3 text-xs text-zinc-400">
                    Human preference: <span className="font-medium capitalize text-zinc-200">{evaluation.preferred_variant === "tie" ? "no preference" : `Variant ${evaluation.preferred_variant?.toUpperCase()}`}</span>
                    {" · "}Result: <span className="font-medium capitalize text-zinc-200">{evaluation.revealed_winner}</span>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
