"use client";

import { memo, useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
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
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { usePieceDetail, useUpdatePieceStatus } from "@/hooks/useContent";
import type { ContentPieceFull } from "@/hooks/useContent";
import type { ContentPiece, ContentStatus, ContentOutcome } from "@/types/content";
import { TYPE_ICON_COLORS, TYPE_ICONS, CONTENT_STATUS_STYLES } from "@/types/content";

/* ── Props ──────────────────────────────────────────────────────── */
interface HistoryTabProps {
  history: ContentPiece[];
  clientId: string;
  canApprove: boolean;
  onHistoryUpdate: Dispatch<SetStateAction<ContentPiece[]>>;
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
}: {
  piece: ContentPieceFull;
  clientId: string;
  canApprove: boolean;
  onBack: () => void;
  onStatusChanged: (id: string, status: ContentStatus) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [outcome, setOutcome] = useState<ContentOutcome | null>(piece.outcome ?? null);
  const [savingOutcome, setSavingOutcome] = useState(false);

  const { updateStatus, isUpdating } = useUpdatePieceStatus();

  const recordOutcome = useCallback(
    async (next: ContentOutcome) => {
      if (savingOutcome) return;
      const prev = outcome;
      setOutcome(next);
      setSavingOutcome(true);
      try {
        await api.post(ROUTES.content.outcome(), { client_id: clientId, id: piece.id, outcome: next });
        toast.success(next === "win" ? "Logged as a win — the Brain will learn from it." : "Noted — the Brain will adjust.");
      } catch {
        setOutcome(prev); // api-client already toasted
      } finally {
        setSavingOutcome(false);
      }
    },
    [savingOutcome, outcome, clientId, piece.id],
  );

  const TypeIcon = TYPE_ICONS[piece.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[piece.content_type] || "text-zinc-400";
  const statusStyle = CONTENT_STATUS_STYLES[piece.status] || CONTENT_STATUS_STYLES.draft;

  const handleCopy = useCallback(async () => {
    if (!piece.body) return;
    await navigator.clipboard.writeText(piece.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [piece.body]);

  const handleStatusChange = useCallback(
    async (newStatus: ContentStatus) => {
      try {
        await updateStatus({
          client_id: clientId,
          id: piece.id,
          status: newStatus,
        });
        onStatusChanged(piece.id, newStatus);
      } catch {
        // error toast handled by the mutation
      }
    },
    [updateStatus, clientId, piece.id, onStatusChanged]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
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
          disabled={!piece.body}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Copy</>
          )}
        </button>

        {canApprove && piece.status === "draft" && (
          <Button
            size="sm"
            onClick={() => handleStatusChange("approved")}
            disabled={isUpdating}
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
            disabled={isUpdating}
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

      {/* Real-world outcome — the strongest signal the Brain can learn from */}
      {piece.status === "approved" && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
          <span className="text-xs text-zinc-400 mr-1">How did this perform?</span>
          <button
            type="button"
            onClick={() => recordOutcome("win")}
            disabled={savingOutcome}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
              outcome === "win" ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-zinc-700 text-zinc-400 hover:text-green-400 hover:border-green-500/40"
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> Performed well
          </button>
          <button
            type="button"
            onClick={() => recordOutcome("miss")}
            disabled={savingOutcome}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
              outcome === "miss" ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/40"
            }`}
          >
            <ThumbsDown className="w-3.5 h-3.5" /> Underperformed
          </button>
        </div>
      )}

      {/* Brief */}
      {piece.brief && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">Brief</p>
          <p className="text-sm text-zinc-400 leading-relaxed">{piece.brief}</p>
        </div>
      )}

      {/* Body */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 flex-1 min-h-64">
        {piece.body ? (
          <div className="px-5 py-4 overflow-y-auto max-h-[60vh]">
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">
              {piece.body}
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-center">
            <p className="text-zinc-600 text-sm">No content body available.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export const HistoryTab = memo(function HistoryTab({
  history,
  clientId,
  canApprove,
  onHistoryUpdate,
}: HistoryTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<ContentPieceFull | null>(null);
  const [search, setSearch] = useState("");

  const detailQuery = usePieceDetail(clientId, selectedId);
  const isLoading = detailQuery.isLoading;

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
    setSelectedId(null);
    setSelectedPiece(null);
  }, []);

  const handleStatusChanged = useCallback(
    (id: string, status: ContentStatus) => {
      // Update the piece in the list
      onHistoryUpdate((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
      // Update the detail view
      setSelectedPiece((prev) => (prev ? { ...prev, status } : prev));
    },
    [onHistoryUpdate]
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
