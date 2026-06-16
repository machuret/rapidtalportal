/**
 * Profile gap analysis for effortless onboarding (Brain 2.0, Milestone F).
 *
 * The field set is derived from the canonical registry (lib/brain/profile-fields.ts)
 * — the `onboarding` concern — so gaps, completeness and prompt injection can no
 * longer silently drift. This module keeps the gap-analysis shape/exports stable.
 */
import { selectFields } from "./profile-fields";

export interface ProfileFieldDef {
  key: string;
  label: string;
  question: string;
  impact: number;     // 1 (nice-to-have) … 3 (high leverage)
  draftable: boolean; // can the Brain reasonably draft this from Vault docs?
}

export const PROFILE_FIELD_DEFS: ProfileFieldDef[] = selectFields("onboarding").map((f) => ({
  key: f.key,
  label: f.label,
  question: f.question,
  impact: f.impact,
  draftable: f.draftable,
}));

export interface ProfileGaps {
  completionPct: number;
  filledCount: number;
  total: number;
  gaps: ProfileFieldDef[];           // empty fields, highest-impact first
  draftableGaps: ProfileFieldDef[];  // subset the Brain can draft from the Vault
}

const isFilled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

export function profileGaps(dna: Record<string, unknown> | null): ProfileGaps {
  const total = PROFILE_FIELD_DEFS.length;
  const filled = PROFILE_FIELD_DEFS.filter((f) => isFilled(dna?.[f.key]));
  const empty = PROFILE_FIELD_DEFS.filter((f) => !isFilled(dna?.[f.key]))
    .sort((a, b) => b.impact - a.impact);
  return {
    completionPct: Math.round((filled.length / total) * 100),
    filledCount: filled.length,
    total,
    gaps: empty,
    draftableGaps: empty.filter((f) => f.draftable),
  };
}
