"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import {
  STYLE_ANALYSIS_CHANNELS,
  STYLE_SOURCES_UPDATED_EVENT,
  VOICE_GOLDENS_UPDATED_EVENT,
  emptyStyleAnalysisProfile,
  type StyleAnalysisChannel,
  type StyleAnalysisProfile,
  type StyleAnalysisResponse,
} from "@/lib/content/style-analysis";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  clientId: string;
  canEdit: boolean;
  clientName?: string;
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

const TEXT_FIELDS: Array<{
  key: keyof Pick<
    StyleAnalysisProfile,
    | "summary"
    | "tone"
    | "audience_relationship"
    | "sentence_style"
    | "paragraph_style"
    | "emoji_usage"
    | "hashtag_usage"
  >;
  label: string;
  hint: string;
}> = [
  { key: "summary", label: "Style summary", hint: "A concise description of how this channel sounds and reads." },
  { key: "tone", label: "Tone", hint: "The consistent emotional and professional register." },
  { key: "audience_relationship", label: "Relationship with the audience", hint: "How the writer addresses, guides or challenges the reader." },
  { key: "sentence_style", label: "Sentence style", hint: "Typical length, complexity, pacing and use of fragments or questions." },
  { key: "paragraph_style", label: "Paragraph style", hint: "Typical paragraph length and flow." },
  { key: "emoji_usage", label: "Emoji usage", hint: "Observed frequency, placement and restraint." },
  { key: "hashtag_usage", label: "Hashtag usage", hint: "Observed number, placement and kinds of hashtags." },
];

const LIST_FIELDS: Array<{
  key: keyof Pick<
    StyleAnalysisProfile,
    | "voice_traits"
    | "hook_patterns"
    | "structure_patterns"
    | "formatting_patterns"
    | "vocabulary_patterns"
    | "cta_patterns"
    | "content_patterns"
    | "avoid_patterns"
  >;
  label: string;
  hint: string;
}> = [
  { key: "voice_traits", label: "Voice traits", hint: "One observable trait per line." },
  { key: "hook_patterns", label: "Opening and hook patterns", hint: "How posts or articles usually begin." },
  { key: "structure_patterns", label: "Structure patterns", hint: "Common ordering of ideas and sections." },
  { key: "formatting_patterns", label: "Formatting patterns", hint: "Lists, headings, spacing, punctuation and emphasis." },
  { key: "vocabulary_patterns", label: "Vocabulary patterns", hint: "Recurring language choices—not phrases to copy." },
  { key: "cta_patterns", label: "Call-to-action patterns", hint: "How the content usually asks the reader to respond." },
  { key: "content_patterns", label: "Recurring content patterns", hint: "Common types of posts, angles and storytelling devices." },
  { key: "avoid_patterns", label: "Patterns to avoid", hint: "Styles that conflict with the observed examples." },
];

function cloneProfile(profile: StyleAnalysisProfile): StyleAnalysisProfile {
  return JSON.parse(JSON.stringify(profile)) as StyleAnalysisProfile;
}

export function StyleAnalysisManager({ clientId, canEdit, clientName }: Props) {
  const [data, setData] = useState<StyleAnalysisResponse | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<StyleAnalysisChannel>("linkedin");
  const [form, setForm] = useState<StyleAnalysisProfile>(emptyStyleAnalysisProfile);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState<"load" | "analyse" | "save" | "approve" | null>("load");

  async function load(silent = false) {
    if (!silent) setWorking("load");
    try {
      const result = await api.get<StyleAnalysisResponse>(
        ROUTES.content.styleAnalysisForClient(clientId),
        { showErrorToast: false },
      );
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Writing style could not be loaded.");
    } finally {
      if (!silent) setWorking(null);
    }
  }

  useEffect(() => {
    void load();
    // clientId identifies the whole manager state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    function refreshAfterCollection(event: Event) {
      const collectedClientId = (event as CustomEvent<{ clientId?: string }>).detail?.clientId;
      if (collectedClientId === clientId) void load(true);
    }
    window.addEventListener(STYLE_SOURCES_UPDATED_EVENT, refreshAfterCollection);
    window.addEventListener(VOICE_GOLDENS_UPDATED_EVENT, refreshAfterCollection);
    return () => {
      window.removeEventListener(STYLE_SOURCES_UPDATED_EVENT, refreshAfterCollection);
      window.removeEventListener(VOICE_GOLDENS_UPDATED_EVENT, refreshAfterCollection);
    };
    // load intentionally uses the current clientId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const channelState = data?.channels[selectedChannel] ?? null;
  const activeRecord = channelState?.draft ?? channelState?.approved ?? null;
  const approvedRecord = channelState?.approved ?? null;
  const calibration = channelState?.calibration ?? null;
  const readySources = useMemo(
    () => channelState?.sources.filter((source) =>
      source.status === "ready" && source.character_count >= 40
    ) ?? [],
    [channelState?.sources],
  );
  const readyCharacters = readySources.reduce((sum, source) => sum + source.character_count, 0);
  const evidenceReady = readySources.length >= 3 && readyCharacters >= 600;

  useEffect(() => {
    setRecordId(activeRecord?.id ?? null);
    setForm(cloneProfile(activeRecord?.analysis ?? emptyStyleAnalysisProfile()));
    setDirty(false);
  }, [activeRecord, selectedChannel]);

  const sourceById = useMemo(
    () => new Map((channelState?.sources ?? []).map((source) => [source.id, source])),
    [channelState?.sources],
  );
  const approvedIsStale = useMemo(() => {
    if (!approvedRecord?.analysed_at) return false;
    const approvedIds = new Set(approvedRecord.source_item_ids);
    const readyIds = new Set(readySources.map((source) => source.id));
    const missingApprovedSource = approvedRecord.source_item_ids.some((id) => !readyIds.has(id));
    const newerUnusedSource = readySources.some((source) =>
      !approvedIds.has(source.id) &&
      new Date(source.created_at).getTime() > new Date(approvedRecord.analysed_at as string).getTime()
    );
    return missingApprovedSource || newerUnusedSource;
  }, [approvedRecord, readySources]);

  async function analyse() {
    if (dirty && !window.confirm("Refresh the analysis and replace your unsaved review changes?")) return;
    setWorking("analyse");
    try {
      await api.post(
        ROUTES.content.styleAnalysis(),
        {
          client_id: clientId,
          channel: selectedChannel,
          expected_updated_at: channelState?.draft?.updated_at ?? null,
        },
        { showErrorToast: false },
      );
      await load(true);
      toast.success(`${CHANNEL_LABELS[selectedChannel]} style analysed. Review the draft before approving it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Style analysis failed.");
    } finally {
      setWorking(null);
    }
  }

  async function save(action: "save" | "approve") {
    if (!recordId) return;
    setWorking(action);
    try {
      await api.patch(
        ROUTES.content.styleAnalysis(),
        {
          client_id: clientId,
          id: recordId,
          action,
          analysis: form,
          expected_updated_at: activeRecord?.updated_at,
        },
        { showErrorToast: false },
      );
      await load(true);
      toast.success(action === "approve"
        ? `${CHANNEL_LABELS[selectedChannel]} style approved and active.`
        : "Style analysis draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Style analysis could not be saved.");
    } finally {
      setWorking(null);
    }
  }

  function setText(key: (typeof TEXT_FIELDS)[number]["key"], value: string) {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setList(key: (typeof LIST_FIELDS)[number]["key"], value: string) {
    setDirty(true);
    setForm((current) => ({
      ...current,
      [key]: value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 10),
    }));
  }

  function changeChannel(channel: StyleAnalysisChannel) {
    if (channel === selectedChannel) return;
    if (dirty && !window.confirm("Discard your unsaved style changes?")) return;
    setSelectedChannel(channel);
  }

  return (
    <section className="mt-6 rounded-xl border border-purple-500/25 bg-purple-500/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-500/15 p-2">
            <FileSearch className="h-5 w-5 text-purple-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Writing style analysis</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
              {clientName ? `Analyse ${clientName}'s` : "Analyse the company’s"} owned content into a reviewable profile for each channel.
              Only an approved profile influences new drafts. Company DNA and deterministic hard rules always remain authoritative.
            </p>
          </div>
        </div>
        {!canEdit && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Read-only
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {STYLE_ANALYSIS_CHANNELS.map((channel) => {
          const state = data?.channels[channel];
          return (
            <button
              key={channel}
              type="button"
              onClick={() => changeChannel(channel)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selectedChannel === channel
                  ? "border-purple-400/60 bg-purple-500/20 text-purple-100"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {CHANNEL_LABELS[channel]}
              {state?.approved ? " ✓" : state?.draft ? " •" : ""}
            </button>
          );
        })}
      </div>

      {working === "load" ? (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading writing style…
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Usable examples</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{readySources.length}</p>
              <p className="text-xs text-zinc-600">{readyCharacters.toLocaleString()} characters</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Active profile</p>
              <p className={`mt-1 text-sm font-semibold ${approvedRecord ? "text-emerald-300" : "text-amber-300"}`}>
                {approvedRecord ? "Approved" : "Not approved"}
              </p>
              <p className="text-xs text-zinc-600">
                {approvedRecord
                  ? `Confidence: ${approvedRecord.analysis.confidence}${approvedIsStale ? " · refresh recommended" : ""}`
                  : "Does not influence generation yet"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-500">Review status</p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">
                {channelState?.draft ? "Draft waiting for review" : approvedRecord ? "No pending changes" : "No analysis yet"}
              </p>
              <p className="text-xs text-zinc-600">
                {channelState?.draft && approvedRecord ? "The approved version remains active" : "Edits require admin approval"}
              </p>
            </div>
          </div>

          {calibration && (
            <div className="mt-4 rounded-lg border border-purple-500/20 bg-zinc-950/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Style-profile calibration</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Deterministic confidence from approved goldens, source depth, recency and consistency.
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  calibration.confidence === "high"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : calibration.confidence === "medium"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border-red-500/30 bg-red-500/10 text-red-200"
                }`}>
                  {calibration.confidence} confidence
                </span>
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                {calibration.approvedGoldenCount} approved golden example{calibration.approvedGoldenCount === 1 ? "" : "s"}
                {" · "}{calibration.representativeGoldenCount} marked strongly representative
              </p>
              {calibration.diagnostics.length ? (
                <div className="mt-3 space-y-2">
                  {calibration.diagnostics.map((diagnostic) => (
                    <div
                      key={`${diagnostic.code}:${diagnostic.message}`}
                      className={`rounded-lg border px-3 py-2 ${
                        diagnostic.severity === "blocking"
                          ? "border-red-500/25 bg-red-500/5"
                          : diagnostic.severity === "warning"
                            ? "border-amber-500/25 bg-amber-500/5"
                            : "border-zinc-800 bg-zinc-950/50"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {diagnostic.message}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{diagnostic.recommendation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  No calibration concerns detected for this channel.
                </p>
              )}
            </div>
          )}

          {(channelState?.sources.length ?? 0) > 0 && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-zinc-300">Recent style sources</p>
                  <p className="mt-0.5 text-xs text-zinc-600">Company-owned examples available for this channel.</p>
                </div>
                {approvedIsStale && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Refresh recommended
                  </span>
                )}
              </div>
              <div className="mt-3 divide-y divide-zinc-800">
                {channelState?.sources.slice(0, 5).map((source) => (
                  <div key={source.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-zinc-300">{source.title}</p>
                      <p className="text-xs text-zinc-600">
                        {source.status === "ready" ? "Ready" : source.status === "processing" ? "Processing" : source.status}
                        {" · "}{source.character_count.toLocaleString()} characters
                      </p>
                    </div>
                    {source.source_url && (
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${source.title}`}
                        className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {canEdit && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void analyse()}
                disabled={!evidenceReady || working !== null}
              >
                {working === "analyse" ? <Loader2 className="animate-spin" /> : activeRecord ? <RefreshCw /> : <Sparkles />}
                {working === "analyse" ? "Analysing…" : activeRecord ? "Refresh analysis" : "Analyse examples"}
              </Button>
              <p className="text-xs text-zinc-500">
                {evidenceReady
                  ? `Uses ${readySources.length} processed ${CHANNEL_LABELS[selectedChannel]} examples.`
                  : `At least 3 processed ${CHANNEL_LABELS[selectedChannel]} examples and 600 characters are required.`}
              </p>
            </div>
          )}

          {!activeRecord ? (
            <div className="mt-4 rounded-lg border border-dashed border-zinc-700 px-5 py-10 text-center">
              <FileSearch className="mx-auto h-7 w-7 text-zinc-600" />
              <p className="mt-2 text-sm font-medium text-zinc-300">No {CHANNEL_LABELS[selectedChannel]} style analysis yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                {canEdit
                  ? "Collect owned examples, process them in the Vault, then run the analysis."
                  : "A client admin or super admin must analyse and approve this channel."}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {channelState?.draft && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/80">
                  You are reviewing a draft analysis. It will not affect generated content until it is approved.
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {TEXT_FIELDS.map((field) => (
                  <label key={field.key} className={field.key === "summary" ? "lg:col-span-2" : ""}>
                    <Label htmlFor={`style-${selectedChannel}-${field.key}`}>{field.label}</Label>
                    <p className="mb-1.5 mt-1 text-xs text-zinc-500">{field.hint}</p>
                    <Textarea
                      id={`style-${selectedChannel}-${field.key}`}
                      value={form[field.key]}
                      readOnly={!canEdit}
                      rows={field.key === "summary" ? 3 : 2}
                      onChange={(event) => setText(field.key, event.target.value)}
                      className="bg-zinc-950/60"
                    />
                  </label>
                ))}
                {LIST_FIELDS.map((field) => (
                  <label key={field.key}>
                    <Label htmlFor={`style-${selectedChannel}-${field.key}`}>{field.label}</Label>
                    <p className="mb-1.5 mt-1 text-xs text-zinc-500">{field.hint}</p>
                    <Textarea
                      id={`style-${selectedChannel}-${field.key}`}
                      value={form[field.key].join("\n")}
                      readOnly={!canEdit}
                      rows={4}
                      onChange={(event) => setList(field.key, event.target.value)}
                      className="bg-zinc-950/60"
                    />
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Analysis confidence</p>
                    <p className="text-xs text-zinc-500">Based on evidence quantity and consistency—not writing quality.</p>
                  </div>
                  <select
                    value={form.confidence}
                    disabled={!canEdit}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      confidence: event.target.value as StyleAnalysisProfile["confidence"],
                    }))}
                    onInput={() => setDirty(true)}
                    className="h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-200"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {form.evidence.length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-sm font-medium text-zinc-200">Evidence behind the analysis</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Observations are tied to the owned examples the analyser actually inspected.
                  </p>
                  <div className="mt-3 space-y-3">
                    {form.evidence.map((entry) => {
                      const source = sourceById.get(entry.source_item_id);
                      return (
                        <div key={entry.source_item_id} className="rounded border border-zinc-800 px-3 py-2">
                          <p className="text-xs font-medium text-zinc-300">
                            {source?.title ?? `Source ${entry.source_item_id}`}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {entry.observations.map((observation) => (
                              <li key={observation} className="text-xs text-zinc-500">• {observation}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {canEdit && (
                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void save("save")}
                    disabled={working !== null || !dirty}
                  >
                    {working === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                    Save review draft
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void save("approve")}
                    disabled={working !== null || (!channelState?.draft && !dirty)}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    {working === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Approve for content engine
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
