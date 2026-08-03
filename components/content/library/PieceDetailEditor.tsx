"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ArrowLeft,
  BookText,
  Copy,
  Check,
  CheckCircle,
  Archive,
  RefreshCw,
  Pencil,
  Save,
  ShieldCheck,
  Download,
  GitCompare,
  CopyPlus,
  WandSparkles,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/LocalTime";
import { Textarea } from "@/components/ui/textarea";
import type { ContentPieceFull } from "@/hooks/useContent";
import type {
  ContentBrief,
  ContentPiece,
  ContentSourceReference,
  ContentStatus,
  ContentType,
} from "@/types/content";
import { TYPE_ICON_COLORS, TYPE_ICONS, CONTENT_STATUS_STYLES } from "@/types/content";
import {
  EditorialLearningPrompt,
  type EditorialLearningSuggestion,
} from "../EditorialLearningPrompt";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { BrainContextUsed } from "@/components/brain/BrainContextUsed";
import { usePieceActions } from "./usePieceActions";
import { buildLiveEditorialChecks } from "@/lib/content/live-checks";
import { groupSourcesForDisplay } from "@/lib/source-display-groups";

/* ── Detail editor ──────────────────────────────────────────────── */
export function PieceDetailEditor({
  piece,
  clientId,
  canApprove,
  onBack,
  onStatusChanged,
  onArtifactCreated,
  onPieceChanged,
  onDirtyChange,
  approvalWarnings = [],
  approvalPending = false,
  backLabel = "Back to content library",
}: {
  piece: ContentPieceFull;
  clientId: string;
  canApprove: boolean;
  onBack: () => void;
  onStatusChanged: (id: string, status: ContentStatus) => void;
  onArtifactCreated: (piece: ContentPiece) => void;
  onPieceChanged: (piece: ContentPieceFull) => void;
  onDirtyChange?: (dirty: boolean) => void;
  approvalWarnings?: string[];
  approvalPending?: boolean;
  backLabel?: string;
}) {
  const [body, setBody] = useState(piece.body ?? "");
  const [persistedBody, setPersistedBody] = useState(piece.body ?? "");
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState(piece.updated_at ?? "");
  const [editing, setEditing] = useState(false);
  const [adaptType, setAdaptType] = useState<ContentType>(
    piece.content_type === "linkedin" ? "facebook" : "linkedin",
  );
  const [revisions, setRevisions] = useState<{
    id: string;
    revision_number: number;
    title: string;
    body: string | null;
    content_brief: ContentBrief;
    reason: string;
    created_at: string;
  }[]>([]);
  const [compareRevision, setCompareRevision] = useState<string | null>(null);
  const [learningSuggestion, setLearningSuggestion] = useState<EditorialLearningSuggestion | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const loadedPieceId = useRef(piece.id);

  useEffect(() => {
    const changedPiece = loadedPieceId.current !== piece.id;
    const localDirty = body !== persistedBody;
    const incomingTimestamp = Date.parse(piece.updated_at ?? "");
    const localTimestamp = Date.parse(currentUpdatedAt);
    const incomingIsNewer =
      Number.isFinite(incomingTimestamp) &&
      (!Number.isFinite(localTimestamp) || incomingTimestamp > localTimestamp);
    const refreshedPiece = incomingIsNewer || (
      piece.updated_at === currentUpdatedAt &&
      (piece.body ?? "") !== persistedBody
    );
    if (changedPiece || (!localDirty && refreshedPiece)) {
      loadedPieceId.current = piece.id;
      setBody(piece.body ?? "");
      setPersistedBody(piece.body ?? "");
      setCurrentUpdatedAt(piece.updated_at ?? "");
      setEditing(false);
      setLearningSuggestion(null);
      setAdaptType(piece.content_type === "linkedin" ? "facebook" : "linkedin");
    }
  }, [
    body,
    currentUpdatedAt,
    persistedBody,
    piece.body,
    piece.content_type,
    piece.id,
    piece.updated_at,
  ]);

  const loadRevisions = useCallback(async () => {
    try {
      const rows = await api.get<typeof revisions>(
        `/api/content/revisions?client_id=${clientId}&piece_id=${piece.id}`,
        { showErrorToast: false },
      );
      setRevisions(rows);
    } catch {
      // Revision history is supportive; editing remains available if it cannot load.
    }
  }, [clientId, piece.id]);

  useEffect(() => { void loadRevisions(); }, [loadRevisions]);

  const dirty = body !== persistedBody;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const {
    copied,
    rewriteInstruction,
    setRewriteInstruction,
    rewriting,
    derivedAction,
    isUpdating,
    isSavingDraft,
    handleCopy,
    saveDraft,
    rewrite,
    duplicate,
    adapt,
    exportText,
    handleStatusChange,
    lifecycleNotice,
  } = usePieceActions({
    piece,
    clientId,
    body,
    persistedBody,
    currentUpdatedAt,
    dirty,
    adaptType,
    editorRef,
    setBody,
    setPersistedBody,
    setCurrentUpdatedAt,
    setEditing,
    setLearningSuggestion,
    loadRevisions,
    onPieceChanged,
    onStatusChanged,
    onArtifactCreated,
  });

  const TypeIcon = TYPE_ICONS[piece.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[piece.content_type] || "text-zinc-400";
  const statusStyle = CONTENT_STATUS_STYLES[piece.status] || CONTENT_STATUS_STYLES.draft;
  const liveChecks = useMemo(
    () => buildLiveEditorialChecks(body, piece.content_type, piece.style_snapshot),
    [body, piece.content_type, piece.style_snapshot],
  );
  const liveWarningCount = liveChecks.reduce((total, check) => total + check.warnings.length, 0);
  const approvalBlockingWarnings = useMemo(
    () => Array.from(new Set([
      ...liveChecks.flatMap((check) => check.warnings),
      ...approvalWarnings,
    ])),
    [approvalWarnings, liveChecks],
  );
  const sourceGroups = useMemo(
    () => groupSourcesForDisplay(piece.source_references ?? [], {
      namespace: (source) => source.kind,
      identity: (source) => source.itemId,
      title: (source) => source.title,
      excerpt: (source) => source.excerpt,
    }),
    [piece.source_references],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={backLabel}
          title={backLabel}
          onClick={() => {
            if (!dirty || window.confirm("Discard your unsaved draft changes?")) onBack();
          }}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {piece.status === "draft" && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit draft
          </button>
        )}

        {piece.status === "draft" && editing && (
          <>
            <Button size="sm" onClick={saveDraft} disabled={isSavingDraft || !body.trim()} className="text-xs h-8">
              {isSavingDraft ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save draft
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setBody(persistedBody); setEditing(false); }} className="text-xs h-8">
              <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
            </Button>
          </>
        )}
        <TypeIcon className={`w-5 h-5 shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white truncate">{piece.title}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {piece.content_type} · <LocalTime value={piece.created_at} opts={{ day: "numeric", month: "short", year: "numeric" }} />
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusStyle}`}>
          {piece.status}
        </span>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="mr-1 text-xs text-zinc-500">Rate this draft</span>
        <BrainFeedback
          clientId={clientId}
          surface="content_draft"
          artifactId={piece.id}
          artifactText={body}
          context={{
            channel: piece.content_type,
            contentType: piece.content_brief?.desiredFormat ?? piece.content_type,
            audience: piece.content_brief?.audience ?? null,
            objective: piece.content_brief?.objective ?? null,
          }}
        />
        <button
          onClick={handleCopy}
          disabled={!body}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Copy</>
          )}
        </button>
        <button
          onClick={exportText}
          disabled={!body}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> Export .txt
        </button>
        <button
          onClick={duplicate}
          disabled={dirty || derivedAction !== null}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
        >
          {derivedAction === "duplicate"
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : <CopyPlus className="w-3.5 h-3.5" />}
          {derivedAction === "duplicate" ? "Duplicating…" : "Duplicate"}
        </button>
        <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden">
          <select
            aria-label="Channel to adapt this draft to"
            value={adaptType}
            onChange={(event) => setAdaptType(event.target.value as ContentType)}
            disabled={derivedAction !== null}
            className="h-8 bg-zinc-900 px-2 text-xs text-zinc-300 border-0"
          >
            {(["x", "linkedin", "facebook", "instagram", "email", "newsletter", "blog", "message"] as ContentType[])
              .filter((type) => type !== piece.content_type)
              .map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button disabled={dirty || derivedAction !== null} onClick={adapt} className="h-8 px-2 text-xs text-purple-300 hover:bg-zinc-800 border-l border-zinc-700 disabled:opacity-40">
            {derivedAction === "adapt" ? "Adapting…" : "Adapt"}
          </button>
        </div>

        {canApprove && piece.status === "draft" && (
          <Button
            size="sm"
            onClick={() => handleStatusChange("approved")}
            disabled={isUpdating || dirty || approvalPending || approvalBlockingWarnings.length > 0}
            title={approvalPending
              ? "Checking the current saved draft before approval."
              : approvalBlockingWarnings.length > 0
                ? "Resolve the displayed validation checks before approval."
                : "Approve this draft"}
            className="bg-green-600 hover:bg-green-700 text-white border-0 text-xs h-8"
          >
            {isUpdating ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
            Approve
          </Button>
        )}

        {canApprove && piece.status === "approved" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm("The piece goes back to draft and can be edited freely.")) {
                void handleStatusChange("draft");
              }
            }}
            disabled={isUpdating || dirty}
            className="text-xs h-8 text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Restore to draft
          </Button>
        )}

        {canApprove && piece.status !== "archived" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleStatusChange("archived")}
            disabled={isUpdating || dirty}
            className="text-xs h-8 text-zinc-400 hover:text-zinc-200"
          >
            <Archive className="w-3.5 h-3.5 mr-1.5" />
            Archive
          </Button>
        )}

        {canApprove && piece.status === "archived" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleStatusChange("draft")}
            disabled={isUpdating}
            className="text-xs h-8 text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Restore to Draft
          </Button>
        )}
      </div>

      {lifecycleNotice && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs ${
            lifecycleNotice.kind === "success"
              ? "border-green-500/25 bg-green-500/5 text-green-200"
              : "border-red-500/25 bg-red-500/5 text-red-200"
          }`}
        >
          {lifecycleNotice.message}
        </p>
      )}

      {canApprove && piece.status === "draft" && !editing && approvalBlockingWarnings.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-medium text-amber-200">
            Approval is blocked until {approvalBlockingWarnings.length} current check{approvalBlockingWarnings.length === 1 ? " is" : "s are"} resolved.
          </p>
          <div className="mt-2 space-y-1">
            {approvalBlockingWarnings.slice(0, 6).map((warning) => (
              <p key={warning} className="text-xs leading-5 text-zinc-400">• {warning}</p>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
            Edit and fix draft
          </Button>
        </div>
      )}

      {canApprove && piece.status === "draft" && !editing && approvalPending && (
        <div role="status" className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-200">
          Checking the current saved draft before approval…
        </div>
      )}

      {/* Brief */}
      <BrainContextUsed
        clientId={clientId}
        snapshotId={piece.brain_context_snapshot_id}
      />

      {piece.brief && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">Brief</p>
          <p className="text-sm text-zinc-400 leading-relaxed">{piece.brief}</p>
          {piece.content_brief && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
              {piece.content_brief.audience && <div><dt className="text-zinc-600">Audience</dt><dd className="text-zinc-400">{piece.content_brief.audience}</dd></div>}
              <div><dt className="text-zinc-600">Tone</dt><dd className="text-zinc-400">{piece.content_brief.tone}</dd></div>
              <div><dt className="text-zinc-600">Length</dt><dd className="text-zinc-400">{piece.content_brief.length}</dd></div>
              {piece.content_brief.callToAction && <div><dt className="text-zinc-600">CTA</dt><dd className="text-zinc-400">{piece.content_brief.callToAction}</dd></div>}
            </dl>
          )}
        </div>
      )}

      {piece.style_snapshot?.summary && piece.style_snapshot.summary.length > 0 && (
        <div className="rounded-lg border border-purple-500/25 bg-purple-500/5 px-4 py-3">
          <p className="text-xs font-medium text-purple-300 mb-1.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Validated Company DNA snapshot
          </p>
          <ul className="space-y-1">
            {piece.style_snapshot.summary.map((rule) => (
              <li key={rule} className="text-xs text-zinc-400">• {rule}</li>
            ))}
          </ul>
          {piece.style_snapshot.styleAnalysis && (
            <p className="mt-2 text-xs text-purple-200/80">
              Approved {piece.style_snapshot.styleAnalysis.channel} style profile:{" "}
              {piece.style_snapshot.styleAnalysis.summary}
            </p>
          )}
          {piece.style_snapshot.exampleSources && piece.style_snapshot.exampleSources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {piece.style_snapshot.exampleSources.map((source) => (
                <span
                  key={source.itemId}
                  className="rounded-full border border-purple-500/20 px-2.5 py-1 text-xs text-purple-100"
                  title="Owned example used for style only"
                >
                  Style: {source.title}
                </span>
              ))}
            </div>
          )}
          {piece.style_snapshot.capturedAt && (
            <p className="text-xs text-zinc-600 mt-2">
              Captured <LocalTime value={piece.style_snapshot.capturedAt} />
            </p>
          )}
        </div>
      )}

      {piece.content_brief?.marketIntelligence && (
        <div className="rounded-lg border border-orange-500/25 bg-orange-500/5 px-4 py-3">
          <p className="text-xs font-medium text-orange-200">Market intelligence provenance</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Idea: {piece.content_brief.marketIntelligence.ideaTitle} ·{" "}
            {piece.content_brief.marketIntelligence.confidence} confidence ·{" "}
            {piece.content_brief.marketIntelligence.novelty} relative to company content
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {piece.content_brief.marketIntelligence.whyValuable}
          </p>
          <p className="mt-1 text-xs leading-5 text-orange-100/80">
            Differentiation: {piece.content_brief.marketIntelligence.differentiation}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {piece.content_brief.marketIntelligence.competitorSources.map((source) => (
              <a
                key={`${source.itemId}:${source.captureVersionId}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                title={`Immutable capture ${source.captureVersionId}\n${source.evidenceQuote}`}
                className="rounded-full border border-orange-500/20 px-2.5 py-1 text-xs text-orange-100 hover:border-orange-400/50"
              >
                {source.competitorName}: {source.title}
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Report {piece.content_brief.marketIntelligence.runId}
          </p>
        </div>
      )}

      {piece.source_references && piece.source_references.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-2">Vault sources used</p>
          <div className="flex flex-wrap gap-1.5">
            {sourceGroups.map((group) => {
              const source: ContentSourceReference = group.representative;
              return (
              <span key={`${source.kind}:${source.itemId}`} title={group.sources.map((item) => item.excerpt).filter(Boolean).join("\n\n")} className="text-xs rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-400">
                {source.title}{group.count > 1 ? ` · ${group.count} related sources` : ""}
              </span>
              );
            })}
          </div>
        </div>
      )}

      {piece.status === "draft" && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
          <p className="text-xs font-medium text-purple-300 mb-2 flex items-center gap-1.5">
            <WandSparkles className="w-3.5 h-3.5" /> Editorial rewrite
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={rewriteInstruction}
              onChange={(event) => setRewriteInstruction(event.target.value)}
              placeholder="e.g. Lead with the customer benefit and make it more direct"
              className="bg-zinc-950 border-zinc-700 h-9 text-sm"
            />
            <Button size="sm" variant="outline" disabled={dirty || rewriting || !rewriteInstruction.trim()} onClick={() => rewrite("section")}>
              Rewrite selection
            </Button>
            <Button size="sm" variant="outline" disabled={dirty || rewriting || !rewriteInstruction.trim()} onClick={() => rewrite("full")}>
              Rewrite all
            </Button>
          </div>
          <p className={`text-xs mt-2 ${dirty ? "text-amber-300" : "text-zinc-600"}`}>
            {dirty
              ? "Save the visible draft before rewriting, duplicating or adapting it."
              : "For a section rewrite, select text inside the editor first."}
          </p>
        </div>
      )}

      {learningSuggestion && (
        <EditorialLearningPrompt
          clientId={clientId}
          suggestion={learningSuggestion}
          channel={piece.content_type}
          contentType={piece.content_brief?.desiredFormat ?? piece.content_type}
          onHandled={() => setLearningSuggestion(null)}
        />
      )}

      {/* Body */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 flex-1 min-h-64">
        {editing ? (
          <div className="p-4">
            <Textarea
              ref={editorRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={18}
              className="min-h-80 bg-zinc-950 border-zinc-700 font-sans text-sm leading-relaxed"
            />
          </div>
        ) : body ? (
          <div className="px-5 py-4 overflow-y-auto max-h-[60vh]">
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">
              {body}
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-center">
            <p className="text-zinc-600 text-sm">No content body available.</p>
          </div>
        )}
      </div>

      {editing && (
        <div className={`rounded-xl border px-4 py-3 ${liveWarningCount
          ? "border-amber-500/25 bg-amber-500/5"
          : "border-green-500/20 bg-green-500/5"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`flex items-center gap-1.5 text-sm font-medium ${liveWarningCount ? "text-amber-200" : "text-green-300"}`}>
              <ShieldCheck className="h-4 w-4" />
              {liveWarningCount ? `${liveWarningCount} live check${liveWarningCount === 1 ? "" : "s"} to review` : "Live checks passed"}
            </p>
            <p className="text-2xs text-zinc-600">Updates as you type · final validation runs after save</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {liveChecks.map((check) => (
              <div key={check.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
                <p className={`text-xs font-medium ${check.warnings.length ? "text-amber-200" : "text-green-300"}`}>
                  {check.label} · {check.warnings.length ? "Review" : "Ready"}
                </p>
                {check.warnings.slice(0, 4).map((warning) => (
                  <p key={warning} className="mt-1.5 text-xs leading-5 text-zinc-400">• {warning}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {revisions.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
            <GitCompare className="w-3.5 h-3.5" /> Revision history
          </p>
          <div className="flex flex-wrap gap-2">
            {revisions.map((revision) => (
              <button
                key={revision.id}
                onClick={() => setCompareRevision(compareRevision === revision.id ? null : revision.id)}
                className={`text-xs rounded-md border px-2.5 py-1.5 ${compareRevision === revision.id ? "border-purple-500/40 bg-purple-500/10 text-purple-300" : "border-zinc-700 text-zinc-400 hover:text-white"}`}
              >
                v{revision.revision_number} · {revision.reason}
              </button>
            ))}
          </div>
          {compareRevision && (() => {
            const revision = revisions.find((item) => item.id === compareRevision);
            if (!revision) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                <div className="rounded-lg bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-600 mb-2">Revision {revision.revision_number}</p>
                  {revision.content_brief?.marketIntelligence && (
                    <p className="mb-2 text-xs text-orange-300">
                      Market provenance retained · report {revision.content_brief.marketIntelligence.runId}
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-xs text-zinc-400">{revision.body}</pre>
                </div>
                <div className="rounded-lg bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-600 mb-2">Current draft</p>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-zinc-300">{body}</pre>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
