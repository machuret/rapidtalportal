"use client";

import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { resolveContentStyle } from "@/supabase/functions/_shared/content-style";
import type { ContentLength, ContentType } from "@/types/content";

const LENGTH_HINTS: Record<ContentLength, string> = {
  short: "Keep it brief and punchy.",
  medium: "Aim for a standard length appropriate to the format.",
  long: "Be comprehensive and detailed.",
};

export function AppliedStylePreview({
  brandStyle,
  channel,
  tone = "professional",
  length = "medium",
  compact = false,
}: {
  brandStyle: Record<string, unknown>;
  channel: ContentType;
  tone?: string;
  length?: ContentLength;
  compact?: boolean;
}) {
  const style = useMemo(
    () => resolveContentStyle(
      brandStyle,
      channel === "social" ? "linkedin" : channel,
      tone,
      LENGTH_HINTS[length],
    ),
    [brandStyle, channel, length, tone],
  );

  return (
    <section
      aria-label="Applied voice and style"
      className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-purple-200">
        <ShieldCheck className="h-4 w-4" /> Applied voice and style
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Preview for <span className="capitalize text-zinc-300">{channel}</span>. Company rules
        override the requested tone.
      </p>
      {style.summary.length ? (
        <ul className={`mt-3 grid gap-1.5 ${compact ? "" : "sm:grid-cols-2"}`}>
          {style.summary.slice(0, compact ? 5 : 10).map((rule) => (
            <li key={rule} className="text-xs leading-5 text-zinc-400">• {rule}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-amber-300">
          No voice guidance is configured for this channel yet. Add it in Company DNA.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-2xs">
        <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-400">
          {style.hardRules.length} hard rule{style.hardRules.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-400">
          {style.styleAnalysis ? "Approved style analysis applied" : "Company DNA style"}
        </span>
      </div>
    </section>
  );
}
