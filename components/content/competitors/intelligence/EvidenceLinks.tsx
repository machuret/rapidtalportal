"use client";

import { ExternalLink } from "lucide-react";
import { readableDate, type SourceById } from "./shared";

interface EvidenceLinksProps {
  ids: string[];
  quotes?: Array<{ source_item_id: string; quote: string }>;
  sourceById: SourceById;
}

/** Verified-capture chips shown under every analysis card. */
export function EvidenceLinks({ ids, quotes = [], sourceById }: EvidenceLinksProps) {
  const quoteById = new Map(quotes.map((quote) => [quote.source_item_id, quote.quote]));
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const source = sourceById.get(id);
        return source ? (
          <a
            key={id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            title={[
              quoteById.get(id) ? `Verified excerpt: “${quoteById.get(id)}”` : source.title,
              source.date_basis === "captured"
                ? "Publication date unavailable; collection date used."
                : `Published ${readableDate(source.effective_at)}`,
            ].join("\n")}
            className="inline-flex max-w-56 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          >
            <span className="truncate">
              {source.competitor_name}: {source.title}
              {source.date_basis === "captured" ? " · date estimated" : ""}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span key={id} className="rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-600">
            Source unavailable
          </span>
        );
      })}
    </div>
  );
}
