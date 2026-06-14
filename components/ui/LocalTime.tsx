"use client";

import { useEffect, useState } from "react";

const DATETIME_DEFAULT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * SSR-safe rendering of a *local* date/time.
 *
 * Unlike `formatDate` (which pins to en-GB/UTC for stable, identical text), this
 * deliberately shows the viewer's own local time-of-day. That's exactly what
 * triggers React hydration mismatches (#418/#422/#425): the server renders in
 * UTC, the browser in the user's timezone. To avoid the mismatch, the server
 * and the first client paint both render the UTC-pinned string (so the hydrated
 * markup matches), then an effect swaps in the user's local time on the client
 * only. `suppressHydrationWarning` covers the subsequent text swap.
 */
export function LocalTime({
  value,
  opts = DATETIME_DEFAULT,
  className,
}: {
  value: string | number | Date;
  opts?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const ssr = new Date(value).toLocaleString("en-GB", { timeZone: "UTC", ...opts });
  const [text, setText] = useState(ssr);

  useEffect(() => {
    setText(new Date(value).toLocaleString(undefined, opts));
    // value/opts are primitives or stable-by-content; serialise opts so a new
    // object literal per render doesn't re-run the effect needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value instanceof Date ? value.getTime() : value, JSON.stringify(opts)]);

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
