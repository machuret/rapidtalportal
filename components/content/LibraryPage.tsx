"use client";

import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { ContentPiece } from "@/types/content";
import { HistoryTab } from "./library/HistoryTab";

interface ContentPage<T> {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
}

/** /content/library — every draft and approved artifact, editable. */
export function LibraryPage({
  clientId,
  canApprove,
  initialHistory,
  historyHasMore: initialHasMore,
  initialSelectedId = null,
}: {
  clientId: string;
  canApprove: boolean;
  initialHistory: ContentPiece[];
  historyHasMore: boolean;
  initialSelectedId?: string | null;
}) {
  const [history, setHistory] = useState<ContentPiece[]>(initialHistory);
  const [historyHasMore, setHistoryHasMore] = useState(initialHasMore);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);

  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreHistory || !historyHasMore) return;
    setLoadingMoreHistory(true);
    try {
      const page = await api.get<ContentPage<ContentPiece>>(
        ROUTES.content.piecesPage(clientId, history.length),
        { showErrorToast: false },
      );
      setHistory((previous) => [
        ...previous,
        ...page.items.filter((item) => !previous.some((existing) => existing.id === item.id)),
      ]);
      setHistoryHasMore(page.hasMore);
    } catch {
      toast.error("Older content could not be loaded. Please try again.");
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [clientId, history.length, historyHasMore, loadingMoreHistory]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 text-sm text-zinc-500">Open any draft to edit, compare, duplicate, adapt, approve, archive, copy or export.</p>
      </div>
      <HistoryTab
        history={history}
        clientId={clientId}
        canApprove={canApprove}
        onHistoryUpdate={setHistory}
        hasMore={historyHasMore}
        loadingMore={loadingMoreHistory}
        onLoadMore={loadMoreHistory}
        initialSelectedId={initialSelectedId}
      />
    </div>
  );
}
