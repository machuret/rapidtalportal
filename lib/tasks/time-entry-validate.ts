/**
 * Validation for time-tracking segments.
 *
 * These segments feed every hours rollup in the app (Supervision, My Team,
 * Reports all sum `time_entries` via lib/tasks/metrics). A backwards or
 * non-parseable timestamp silently corrupts those totals, so the write path
 * rejects them here before they ever hit the table.
 *
 * Pure + dependency-free so it unit-tests cleanly and can run in the route
 * handler without a DB round-trip.
 */

/** True when `s` parses to a real instant (accepts ISO 8601 / anything Date.parse handles). */
export function isValidInstant(s: string): boolean {
  return Number.isFinite(Date.parse(s));
}

/**
 * Validate a segment's start/end. Returns a human-readable error string when
 * invalid, or `null` when the times are acceptable. An absent/empty `ended_at`
 * is allowed — that's an open (still-running) segment.
 */
export function validateSegmentTimes(started_at: string, ended_at?: string | null): string | null {
  if (!isValidInstant(started_at)) return "started_at is not a valid timestamp.";

  if (ended_at != null && ended_at !== "") {
    if (!isValidInstant(ended_at)) return "ended_at is not a valid timestamp.";
    if (Date.parse(ended_at) < Date.parse(started_at)) {
      return "ended_at cannot be before started_at.";
    }
  }

  return null;
}
