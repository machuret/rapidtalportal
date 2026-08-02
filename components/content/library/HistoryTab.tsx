"use client";

import { memo, useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import {
  Clock,
  ChevronRight,
  BookText,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/LocalTime";
import { usePieceDetail } from "@/hooks/useContent";
import type { ContentPieceFull } from "@/hooks/useContent";
import type { ContentPiece, ContentStatus } from "@/types/content";
import { TYPE_ICON_COLORS, TYPE_ICONS, CONTENT_STATUS_STYLES } from "@/types/content";
import { PieceDetailEditor } from "./PieceDetailEditor";

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
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  backLabel?: string;
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
          {piece.content_type} · <LocalTime value={piece.created_at} opts={{ day: "numeric", month: "short", year: "numeric" }} />
        </p>
      </div>

      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusStyle}`}>
        {piece.status}
      </span>

      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
    </button>
  );
});

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
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  backLabel,
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
    setSelectedPiece(null);
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
      <PieceDetailEditor
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
        backLabel={backLabel}
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

  if (selectedId && detailQuery.isError) {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-8 text-center">
        <p className="font-medium text-red-200">This content could not be opened.</p>
        <p className="mt-1 text-sm text-zinc-400">
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "The detail request failed. Your content has not been removed."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void detailQuery.refetch()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${detailQuery.isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
          <Button variant="ghost" onClick={handleBack}>Back to History</Button>
        </div>
      </div>
    );
  }

  // Empty state
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center">
        <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400">No content created yet. Return to Ideas or use Quick Create to generate a draft.</p>
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
      {hasMore && !search.trim() && onLoadMore && (
        <Button
          variant="outline"
          disabled={loadingMore}
          onClick={() => void onLoadMore()}
        >
          {loadingMore ? "Loading older content…" : "Load older content"}
        </Button>
      )}
    </div>
  );
});
