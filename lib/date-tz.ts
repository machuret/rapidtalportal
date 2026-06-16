/**
 * Timezone-aware "today".
 *
 * Server handlers run in UTC, but a user's calendar day is in *their* timezone.
 * Comparing a client-submitted local date against a UTC "today" wrongly rejects
 * valid input around the day boundary (e.g. a Manila VA, UTC+8, logging at 7am
 * local is still "yesterday" in UTC). Compute the date in the user's zone
 * instead.
 *
 * Uses Intl (full-ICU, available on Node 18+) — no extra dependency. The en-CA
 * locale renders as yyyy-MM-dd. Falls back to UTC for a null/invalid zone.
 */
export function todayInTimezone(tz: string | null | undefined, now: Date = new Date()): string {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

  try {
    return fmt(tz || "UTC");
  } catch {
    // Invalid/unknown IANA zone → safe UTC fallback.
    return fmt("UTC");
  }
}
