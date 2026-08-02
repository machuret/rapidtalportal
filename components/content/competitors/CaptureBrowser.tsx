"use client";

import { ExternalLink, Loader2, X } from "lucide-react";
import type { CompetitorContentItem } from "@/types/competitors";
import { Button } from "@/components/ui/button";
import { formatDate } from "./utils";

export interface CaptureBrowserState {
  competitorId: string;
  items: CompetitorContentItem[];
  page: number;
  total: number;
  hasMore: boolean;
  selected: CompetitorContentItem | null;
  loading: boolean;
}

interface CaptureBrowserProps {
  browser: CaptureBrowserState;
  onBrowse: (page: number) => void;
  onInspect: (itemId: string) => void;
  onClose: () => void;
}

/** Paginated captured-content list with a full-text inspector. */
export function CaptureBrowser({ browser, onBrowse, onInspect, onClose }: CaptureBrowserProps) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-medium text-zinc-200">Captured content</h4>
          <p className="text-xs text-zinc-500">{browser.total} captured items tracked</p>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Close captured content" onClick={onClose}>
          <X />
        </Button>
      </div>
      {browser.loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading captures…
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)]">
          <div className="space-y-2">
            {browser.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onInspect(item.id)}
                className={`w-full rounded-lg border p-3 text-left ${
                  browser.selected?.id === item.id
                    ? "border-orange-500/50 bg-orange-500/10"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <span className="block truncate text-sm text-zinc-300">{item.title}</span>
                <span className="mt-1 block text-xs text-zinc-600">
                  {item.is_removed ? "No longer found · " : ""}{formatDate(item.captured_at)}
                </span>
              </button>
            ))}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={browser.page === 0}
                onClick={() => onBrowse(browser.page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-zinc-600">Page {browser.page + 1}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!browser.hasMore}
                onClick={() => onBrowse(browser.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          <div className="min-h-56 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            {browser.selected ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h5 className="font-medium text-zinc-200">{browser.selected.title}</h5>
                  <a
                    href={browser.selected.canonical_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-zinc-400">
                  {browser.selected.raw_content}
                </pre>
              </>
            ) : (
              <p className="py-16 text-center text-sm text-zinc-600">
                Select an item to inspect its captured text.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
