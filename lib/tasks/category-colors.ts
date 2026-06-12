/**
 * The fixed category colour palette — the single source of truth shared by the
 * DB CHECK constraint (053_task_categories.sql), the card chips, and the manager
 * swatches. Stored as a KEY (e.g. "blue"), never a hex value, so the styling
 * guard stays happy and Tailwind can see every class literal at build time.
 */
export const CATEGORY_COLORS = {
  zinc:   { chip: "bg-zinc-700/40 text-zinc-300",     dot: "bg-zinc-400",   swatch: "bg-zinc-500" },
  blue:   { chip: "bg-blue-500/15 text-blue-300",     dot: "bg-blue-400",   swatch: "bg-blue-500" },
  green:  { chip: "bg-green-500/15 text-green-300",   dot: "bg-green-400",  swatch: "bg-green-500" },
  amber:  { chip: "bg-amber-500/15 text-amber-300",   dot: "bg-amber-400",  swatch: "bg-amber-500" },
  red:    { chip: "bg-red-500/15 text-red-300",       dot: "bg-red-400",    swatch: "bg-red-500" },
  purple: { chip: "bg-purple-500/15 text-purple-300", dot: "bg-purple-400", swatch: "bg-purple-500" },
  pink:   { chip: "bg-pink-500/15 text-pink-300",     dot: "bg-pink-400",   swatch: "bg-pink-500" },
  cyan:   { chip: "bg-cyan-500/15 text-cyan-300",     dot: "bg-cyan-400",   swatch: "bg-cyan-500" },
  orange: { chip: "bg-orange-500/15 text-orange-300", dot: "bg-orange-400", swatch: "bg-orange-500" },
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;
export const CATEGORY_COLOR_KEYS = Object.keys(CATEGORY_COLORS) as CategoryColor[];

/** Classes for a colour key, falling back to a neutral chip for unknown values. */
export const categoryColor = (key: string) =>
  CATEGORY_COLORS[key as CategoryColor] ?? CATEGORY_COLORS.zinc;
