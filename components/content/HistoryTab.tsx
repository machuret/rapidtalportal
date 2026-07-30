"use client";

import { memo, useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import {
  Clock,
  ChevronRight,
  ArrowLeft,
  BookText,
  Copy,
  Check,
  CheckCircle,
  Archive,
  RefreshCw,
  Search,
  Pencil,
  Save,
  ShieldCheck,
  Download,
  GitCompare,
  CopyPlus,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/LocalTime";
import { Textarea } from "@/components/ui/textarea";
import { usePieceDetail, useUpdateContentPiece, useUpdatePieceStatus } from "@/hooks/useContent";
import type { ContentPieceFull } from "@/hooks/useContent";
import type {
  ContentBrief,
  ContentPiece,
  ContentSourceReference,
  ContentStatus,
  ContentType,
} from "@/types/content";
import { TYPE_ICON_COLORS, TYPE_ICONS, CONTENT_STATUS_STYLES } from "@/types/content";

/* ── Props ──────────────────────────────────────────────────────── */
interface HistoryTabProps {
  history: ContentPiece[];
  clientId: string;
  canApprove: boolean;
  onHistoryUpdate: Dispatch<SetStateAction<ContentPiece[]>>;
  initialSelectedId?: string | null;
  onBackToWorkflow?: () => void;
  onPieceStatusChanged?: (piece: ContentPieceFull) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onArtifactCreated?: (piece: ContentPiece) => void;
}

/* ── List item ──────────────────────────────────────────────────── */
const HistoryItem = memo(function HistoryItem({
  piece,
  onClick,
}: {
  piece: ContentPiece;
  onClick: (piece: ContentPiece) => void;
}) {
  const TypeIcon = TYPE_ICONS[piece.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[piece.content_type] || "text-zinc-400";
  const statusStyle = CONTENT_STATUS_STYLES[piece.status] || CONTENT_STATUS_STYLES.draft;

  const handleClick = useCallback(() => onClick(piece), [onClick, piece]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-left hover:bg-zinc-800/70 transition-colors"
    >
      <TypeIcon className={`w-5 h-5 shrink-0 ${iconColor}`} />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{piece.title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {piece.content_type} · {formatDate(piece.created_at)}
        </p>
      </div>

      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusStyle}`}>
        {piece.status}
      </span>

      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
    </button>
  );
});

/* ── Detail view ────────────────────────────────────────────────── */
function PieceDetail({
  piece,
  clientId,
  canApprove,
  onBack,
  onStatusChanged,
  onArtifactCreated,
  onPieceChanged,
  onDirtyChange,
}: {
  piece: ContentPieceFull;
  clientId: string;
  canApprove: boolean;
  onBack: () => void;
  onStatusChanged: (id: string, status: ContentStatus) => void;
  onArtifactCreated: (piece: ContentPiece) => void;
  onPieceChanged: (piece: ContentPieceFull) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [body, setBody] = useState(piece.body ?? "");
  const [persistedBody, setPersistedBody] = useState(piece.body ?? "");
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState(piece.updated_at ?? "");
  const [editing, setEditing] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
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
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const loadedPieceId = useRef(piece.id);

  const { updateStatus, isUpdating } = useUpdatePieceStatus();
  const { updatePiece, isUpdating: isSavingDraft } = useUpdateContentPiece();

  useEffect(() => {
    if (loadedPieceId.current !== piece.id) {
      loadedPieceId.current = piece.id;
      setBody(piece.body ?? "");
      setPersistedBody(piece.body ?? "");
      setCurrentUpdatedAt(piece.updated_at ?? "");
      setEditing(false);
      setAdaptType(piece.content_type === "linkedin" ? "facebook" : "linkedin");
    }
  }, [piece.id, piece.body, piece.updated_at, piece.content_type]);

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

  const TypeIcon = TYPE_ICONS[piece.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[piece.content_type] || "text-zinc-400";
  const statusStyle = CONTENT_STATUS_STYLES[piece.status] || CONTENT_STATUS_STYLES.draft;

  const handleCopy = useCallback(async () => {
    if (!body) return;
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [body]);

  const saveDraft = useCallback(async () => {
    try {
      const updated = await updatePiece({
        client_id: clientId,
        id: piece.id,
        body,
        expected_updated_at: currentUpdatedAt || undefined,
      });
      setPersistedBody(updated.body ?? "");
      setCurrentUpdatedAt(updated.updated_at ?? "");
      onPieceChanged(updated);
      setEditing(false);
      await loadRevisions();
      toast.success("Draft saved.");
    } catch {
      // mutation surfaces the error
    }
  }, [updatePiece, clientId, piece.id, body, currentUpdatedAt, loadRevisions, onPieceChanged]);

  const rewrite = useCallback(async (scope: "full" | "section") => {
    if (!rewriteInstruction.trim()) return;
    const element = editorRef.current;
    const selectedText = element && element.selectionEnd > element.selectionStart
      ? body.slice(element.selectionStart, element.selectionEnd)
      : "";
    const selectionStart = element?.selectionStart ?? 0;
    const selectionEnd = element?.selectionEnd ?? 0;
    if (scope === "section" && !selectedText) {
      toast.error("Select the section you want to rewrite first.");
      return;
    }
    setRewriting(true);
    try {
      const result = await api.post<ContentPieceFull>("/content/rewrite", {
        client_id: clientId,
        id: piece.id,
        scope,
        instruction: rewriteInstruction.trim(),
        expected_updated_at: currentUpdatedAt,
        selectedText: scope === "section" ? selectedText : undefined,
        selectionStart: scope === "section" ? selectionStart : undefined,
        selectionEnd: scope === "section" ? selectionEnd : undefined,
      });
      setBody(result.body ?? "");
      setPersistedBody(result.body ?? "");
      setCurrentUpdatedAt(result.updated_at ?? "");
      onPieceChanged(result);
      setEditing(true);
      setRewriteInstruction("");
      await loadRevisions();
      toast.success(scope === "section" ? "Section rewritten." : "Draft rewritten.");
    } catch {
      // API client surfaces the error.
    } finally {
      setRewriting(false);
    }
  }, [body, clientId, piece.id, rewriteInstruction, currentUpdatedAt, loadRevisions, onPieceChanged]);

  const duplicate = useCallback(async () => {
    try {
      const created = await api.post<ContentPiece>("/content/duplicate", { client_id: clientId, id: piece.id });
      onArtifactCreated(created);
      toast.success("Draft duplicated. It is available in History.");
    } catch {
      // API client surfaces the error.
    }
  }, [clientId, piece.id, onArtifactCreated]);

  const adapt = useCallback(async () => {
    try {
      const created = await api.post<ContentPiece>("/content/adapt", {
        client_id: clientId,
        id: piece.id,
        target_type: adaptType,
      });
      onArtifactCreated(created);
      toast.success(`Adapted into one ${adaptType} draft.`);
    } catch {
      // API client surfaces the error.
    }
  }, [clientId, piece.id, adaptType, onArtifactCreated]);

  const exportText = useCallback(() => {
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${piece.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "content"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [body, piece.title]);

  const handleStatusChange = useCallback(
    async (newStatus: ContentStatus) => {
      if (dirty) {
        toast.error("Save or discard the current edit before changing status.");
        return;
      }
      try {
        const updated = await updateStatus({
          client_id: clientId,
          id: piece.id,
          status: newStatus,
          expected_updated_at: currentUpdatedAt || undefined,
        });
        setPersistedBody(updated.body ?? persistedBody);
        setCurrentUpdatedAt(updated.updated_at ?? "");
        onStatusChanged(piece.id, newStatus);
        onPieceChanged(updated);
      } catch {
        // error toast handled by the mutation
      }
    },
    [dirty, updateStatus, clientId, piece.id, currentUpdatedAt, persistedBody, onStatusChanged, onPieceChanged]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
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
            {piece.content_type} · {formatDate(piece.created_at)}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusStyle}`}>
          {piece.status}
        </span>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
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
          disabled={dirty}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
        >
          <CopyPlus className="w-3.5 h-3.5" /> Duplicate
        </button>
        <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden">
          <select
            value={adaptType}
            onChange={(event) => setAdaptType(event.target.value as ContentType)}
            className="h-8 bg-zinc-900 px-2 text-xs text-zinc-300 border-0"
          >
            {(["x", "linkedin", "facebook", "instagram", "email", "newsletter", "blog", "message"] as ContentType[])
              .filter((type) => type !== piece.content_type)
              .map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button disabled={dirty} onClick={adapt} className="h-8 px-2 text-xs text-purple-300 hover:bg-zinc-800 border-l border-zinc-700 disabled:opacity-40">
            Adapt
          </button>
        </div>

        {canApprove && piece.status === "draft" && (
          <Button
            size="sm"
            onClick={() => handleStatusChange("approved")}
            disabled={isUpdating || dirty}
            className="bg-green-600 hover:bg-green-700 text-white border-0 text-xs h-8"
          >
            {isUpdating ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
            Approve
          </Button>
        )}

        {piece.status !== "archived" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleStatusChange("archived")}
            disabled={isUpdating || dirty}
            className="text-xs h-8 text-zinc-400 hover:text-zinc-200"
          >
            <Archive className="w-3.5 h-3.5 mr-1.5" />
            Archive
          </Button>
        )}

        {piece.status === "archived" && (
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

      {/* Brief */}
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
            {piece.source_references.map((source: ContentSourceReference) => (
              <span key={`${source.kind}:${source.itemId}`} title={source.excerpt} className="text-xs rounded-full bg-zinc-800 px-2.5 py-1 text-zinc-400">
                {source.title}
              </span>
            ))}
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

/* ── Main component ─────────────────────────────────────────────── */
export const HistoryTab = memo(function HistoryTab({
  history,
  clientId,
  canApprove,
  onHistoryUpdate,
  initialSelectedId = null,
  onBackToWorkflow,
  onPieceStatusChanged,
  onDirtyChange,
  onArtifactCreated,
}: HistoryTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [selectedPiece, setSelectedPiece] = useState<ContentPieceFull | null>(null);
  const [search, setSearch] = useState("");

  const detailQuery = usePieceDetail(clientId, selectedId);
  const isLoading = detailQuery.isLoading;

  useEffect(() => {
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  // Sync fetched detail into local selected piece (so status edits can patch it)
  useEffect(() => {
    if (detailQuery.data) {
      setSelectedPiece(detailQuery.data);
    }
  }, [detailQuery.data]);

  const handleItemClick = useCallback((piece: ContentPiece) => {
    setSelectedId(piece.id);
  }, []);

  const handleBack = useCallback(() => {
    if (onBackToWorkflow) {
      onBackToWorkflow();
      return;
    }
    setSelectedId(null);
    setSelectedPiece(null);
  }, [onBackToWorkflow]);

  const handleStatusChanged = useCallback(
    (id: string, status: ContentStatus) => {
      // Update the piece in the list
      onHistoryUpdate((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
      const next = selectedPiece ? { ...selectedPiece, status } : null;
      if (next) {
        setSelectedPiece(next);
        onPieceStatusChanged?.(next);
      }
    },
    [onHistoryUpdate, onPieceStatusChanged, selectedPiece]
  );

  // Detail view
  if (selectedPiece) {
    return (
      <PieceDetail
        piece={selectedPiece}
        clientId={clientId}
        canApprove={canApprove}
        onBack={handleBack}
        onStatusChanged={handleStatusChanged}
        onArtifactCreated={(created) => {
          onHistoryUpdate((previous) => [created, ...previous]);
          onArtifactCreated?.(created);
        }}
        onPieceChanged={setSelectedPiece}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  // Loading overlay
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  // Empty state
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
        <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400">No content created yet. Switch to Create tab to get started.</p>
      </div>
    );
  }

  // Filter
  const filtered = search.trim()
    ? history.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.content_type.toLowerCase().includes(search.toLowerCase()) ||
          p.status.toLowerCase().includes(search.toLowerCase())
      )
    : history;

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, type, or status..."
          className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-700"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-zinc-600 text-sm py-6 text-center">
          No results for &ldquo;{search}&rdquo;
        </p>
      ) : (
        filtered.map((piece) => (
          <HistoryItem key={piece.id} piece={piece} onClick={handleItemClick} />
        ))
      )}
    </div>
  );
});
