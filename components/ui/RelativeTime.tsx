"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

/**
 * Hydration-safe relative time ("5m ago", "3h ago", else an absolute date).
 *
 * The relative string depends on `Date.now()`, which differs between the server
 * render and the client hydration — exactly what triggers React hydration
 * mismatches (#418/#422/#425). So the server and the first client paint both
 * render a stable, UTC-pinned absolute date (via formatDate), then an effect
 * swaps in the relative string on the client only. `suppressHydrationWarning`
 * covers that text swap.
 */
function absolute(value: string): string {
  return formatDate(value, { day: "numeric", month: "short" });
}

export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const [text, setText] = useState(() => absolute(value));

  useEffect(() => {
    const s = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (s < 3600) setText(`${Math.max(1, Math.floor(s / 60))}m ago`);
    else if (s < 86400) setText(`${Math.floor(s / 3600)}h ago`);
    else setText(absolute(value));
  }, [value]);

  return <span className={className} suppressHydrationWarning>{text}</span>;
}
