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

const PLATFORM_STRUCTURE: Partial<Record<ContentType, string>> = {
  linkedin: "Short hook, at least two brief paragraphs, and one natural CTA or discussion question.",
  facebook: "Conversational opening, short body, and one community-focused action.",
  instagram: "One Caption section, one Visual direction, and 2–8 relevant hashtags.",
  x: "One focused post within 280 characters.",
  email: "Subject line, greeting, concise body, one CTA, and sign-off.",
  newsletter: "Subject line, headline, at least two sections, featured insight, and one CTA.",
  blog: "SEO-friendly title, introduction, at least three sections, practical detail, and concluding CTA.",
  message: "One concise, natural message ready to send.",
  other: "One polished, ready-to-use business communication.",
  social: "One LinkedIn-style artifact; no bundled platform variants.",
};

function hasConfiguredBrandStyle(brandStyle: Record<string, unknown>): boolean {
  const styleFields = [
    "brand_voice",
    "content_style",
    "internal_rules",
    "sign_off",
    "preferred_terms",
    "prohibited_terms",
    "emoji_policy",
    "humour_policy",
    "default_cta_style",
    "approved_claims",
    "prohibited_claims",
    "channel_styles",
    "hard_rules",
  ];
  return styleFields.some((field) => {
    const value = brandStyle[field];
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
  });
}

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
  const hasConfiguredStyle = useMemo(
    () => hasConfiguredBrandStyle(brandStyle),
    [brandStyle],
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
        Preview for <span className="capitalize text-zinc-300">{channel}</span>. Configured
        company rules override the requested tone.
      </p>
      {PLATFORM_STRUCTURE[channel] && (
        <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs leading-5 text-zinc-300">
          <span className="font-medium text-purple-200">Platform structure:</span>{" "}
          {PLATFORM_STRUCTURE[channel]}
        </p>
      )}
      {style.summary.length ? (
        <ul className={`mt-3 grid gap-1.5 ${compact ? "" : "sm:grid-cols-2"}`}>
          {style.summary.slice(0, compact ? 5 : 10).map((rule) => (
            <li key={rule} className="text-xs leading-5 text-zinc-400">• {rule}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-amber-300">
          No voice guidance is configured for this channel yet. Add it under Company → Voice.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-2xs">
        <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-400">
          {style.hardRules.length
            ? `${style.hardRules.length} additional hard rule${style.hardRules.length === 1 ? "" : "s"}`
            : "No additional hard rules"}
        </span>
        {style.disallowEmoji && (
          <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-400">
            No-emoji rule enforced
          </span>
        )}
        <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-400">
          {style.styleAnalysis
            ? "Approved style analysis applied"
            : hasConfiguredStyle
              ? "Approved company voice"
              : "Generic professional style using company profile context"}
        </span>
      </div>
    </section>
  );
}
