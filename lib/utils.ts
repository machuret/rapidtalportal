import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * SSR-safe date formatting. `toLocaleDateString()` with the runtime's default
 * locale/timezone renders differently on the server (UTC) than in the browser
 * (the user's locale), which causes React hydration text mismatches
 * (#418/#422/#425). Pinning the locale + timeZone makes server and client emit
 * identical text, so it's stable through hydration.
 */
export function formatDate(
  value: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

/** SSR-safe number formatting (pinned locale) — same hydration reasoning as formatDate. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-GB");
}

