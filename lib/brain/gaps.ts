/**
 * Profile gap analysis for effortless onboarding (Brain 2.0, Milestone F).
 *
 * One canonical definition of the company-profile fields that feed the Brain,
 * each with a plain-English question and an impact weight, so we can:
 *   • tell the user which gaps matter most ("3 questions to make your Brain smarter"),
 *   • know which fields the Brain can draft from the Vault.
 */
export interface ProfileFieldDef {
  key: string;
  label: string;
  question: string;
  impact: number;     // 1 (nice-to-have) … 3 (high leverage)
  draftable: boolean; // can the Brain reasonably draft this from Vault docs?
}

export const PROFILE_FIELD_DEFS: ProfileFieldDef[] = [
  { key: "company_name",       label: "Company name",       question: "What's your company called?",                              impact: 2, draftable: true },
  { key: "services",           label: "Products & services", question: "What products or services do you offer?",                  impact: 3, draftable: true },
  { key: "target_demographic", label: "Ideal customers",    question: "Who are your ideal customers?",                            impact: 3, draftable: true },
  { key: "brand_voice",        label: "Brand voice",        question: "How should your brand sound — tone and personality?",      impact: 3, draftable: true },
  { key: "values",             label: "Values",             question: "What does your company stand for?",                        impact: 2, draftable: true },
  { key: "content_style",      label: "Content style",      question: "Any content style preferences — length, format, do's/don'ts?", impact: 2, draftable: true },
  { key: "business_goals",     label: "Business goals",     question: "What are your main business goals right now?",             impact: 2, draftable: true },
  { key: "marketing_goals",    label: "Marketing goals",    question: "What are you trying to achieve with marketing?",           impact: 2, draftable: true },
  { key: "team",               label: "Team",               question: "Who are the key people on your team?",                     impact: 1, draftable: true },
  { key: "tools_used",         label: "Tools",              question: "What tools and platforms do you use?",                     impact: 1, draftable: true },
  { key: "internal_rules",     label: "Hard rules",         question: "Any hard rules the AI must always follow?",                impact: 2, draftable: false },
];

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
