import type { DailyLogMood } from "@/types/database";

/** Canonical mood set — mirrors the daily_logs mood enum. */
export type Mood = DailyLogMood;

export interface MoodMeta {
  /** Coloured-dot glyph used wherever a mood is rendered compactly. */
  emoji: string;
  /** Human label, capitalised ("Great"). */
  label: string;
  /** Text colour class for mood labels. */
  color: string;
  /** Progress-bar fill class for mood distribution bars. */
  bar: string;
  /** Badge classes for the admin review pill. */
  pill: string;
  /** 1–5 score (overwhelmed…great) for averages and charts. */
  score: number;
}

/**
 * Single source of truth for daily-log mood presentation. Previously four
 * diverging copies lived in supervision/[id], team, team/[id] and
 * AdminDailyLogsReview (one even used face emoji instead of dots).
 */
export const MOOD_META: Record<Mood, MoodMeta> = {
  great:       { emoji: "🟢", label: "Great",       color: "text-green-400",  bar: "bg-green-400",  pill: "bg-green-500/20 text-green-400",   score: 5 },
  good:        { emoji: "🔵", label: "Good",        color: "text-blue-400",   bar: "bg-blue-400",   pill: "bg-blue-500/20 text-blue-400",     score: 4 },
  neutral:     { emoji: "🟡", label: "Neutral",     color: "text-yellow-400", bar: "bg-yellow-400", pill: "bg-yellow-500/20 text-yellow-400", score: 3 },
  difficult:   { emoji: "🟠", label: "Difficult",   color: "text-orange-400", bar: "bg-orange-400", pill: "bg-orange-500/20 text-orange-400", score: 2 },
  overwhelmed: { emoji: "🔴", label: "Overwhelmed", color: "text-red-400",    bar: "bg-red-400",    pill: "bg-red-500/20 text-red-400",       score: 1 },
};

/** Safe lookup for loosely-typed query rows (mood arrives as `string | null`). */
export function moodMeta(mood: string | null | undefined): MoodMeta | null {
  return mood && mood in MOOD_META ? MOOD_META[mood as Mood] : null;
}
