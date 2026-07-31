/**
 * THE canonical Company-Brain profile field registry.
 *
 * Historically the profile fields were forked across three files and silently
 * drifted (gaps.ts, score.ts, context.ts) — a field could feed generation but
 * not count toward completeness, or vice-versa. This is the single source of
 * truth. Each field declares which *concerns* it belongs to:
 *
 *   • onboarding   — shown as a gap/question the user can answer (gaps.ts)
 *   • completeness — counts toward the Brain Score profile % (score.ts)
 *   • prompt       — injected by the official shared Brain Context resolver
 *
 * To add/change a profile field, edit ONLY this list and set its flags
 * deliberately. The three consumers derive their views from `selectFields()`.
 */
export interface BrainProfileField {
  key: string;
  /** Onboarding/UI label, e.g. "Company name". */
  label: string;
  /** Short label used when injecting into the generation prompt, e.g. "Company". */
  promptLabel: string;
  /** Plain-English onboarding question (only meaningful when onboarding=true). */
  question: string;
  impact: number;      // 1 (nice-to-have) … 3 (high leverage)
  draftable: boolean;  // can the Brain reasonably draft this from Vault docs?
  onboarding: boolean; // appears as an onboarding gap/question
  completeness: boolean; // counts toward the Brain Score profile %
  prompt: boolean;     // injected into the generation context
}

/**
 * Canonical order = the order most useful to the model when injected into a
 * prompt (the only concern where order is load-bearing; gaps re-sorts by impact,
 * completeness is order-independent).
 */
export const BRAIN_PROFILE_FIELDS: BrainProfileField[] = [
  { key: "company_name",       label: "Company name",        promptLabel: "Company",                     question: "What's your company called?",                                  impact: 2, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "client_type",        label: "Business type",       promptLabel: "Type",                        question: "What kind of business are you?",                               impact: 1, draftable: false, onboarding: false, completeness: false, prompt: true },
  { key: "services",           label: "Products & services", promptLabel: "Services",                    question: "What products or services do you offer?",                      impact: 3, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "values",             label: "Values",              promptLabel: "Values",                      question: "What does your company stand for?",                            impact: 2, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "target_demographic", label: "Ideal customers",     promptLabel: "Target demographic",          question: "Who are your ideal customers?",                                impact: 3, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "business_goals",     label: "Business goals",      promptLabel: "Business goals",              question: "What are your main business goals right now?",                 impact: 2, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "marketing_goals",    label: "Marketing goals",     promptLabel: "Marketing goals",             question: "What are you trying to achieve with marketing?",               impact: 2, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "team",               label: "Team",                promptLabel: "Team",                        question: "Who are the key people on your team?",                         impact: 1, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "tools_used",         label: "Tools",               promptLabel: "Tools they use",              question: "What tools and platforms do you use?",                        impact: 1, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "website_content",    label: "Website content",     promptLabel: "Website content",             question: "",                                                             impact: 1, draftable: true,  onboarding: false, completeness: true,  prompt: true },
  { key: "brand_voice",        label: "Brand voice",         promptLabel: "Brand voice & tone",          question: "How should your brand sound — tone and personality?",          impact: 3, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "content_style",      label: "Content style",       promptLabel: "Content tone & style",        question: "Any content style preferences — length, format, do's/don'ts?", impact: 2, draftable: true,  onboarding: true,  completeness: true,  prompt: true },
  { key: "internal_rules",     label: "Editorial guidance",  promptLabel: "Priority editorial guidance", question: "Any editorial guidance the AI should follow?",                impact: 2, draftable: false, onboarding: true,  completeness: true,  prompt: true },
];

type Concern = "onboarding" | "completeness" | "prompt";

/** Fields belonging to a given concern, in canonical order. */
export function selectFields(concern: Concern): BrainProfileField[] {
  return BRAIN_PROFILE_FIELDS.filter((f) => f[concern]);
}

/** Just the column keys for a concern (for `.select(...)` / completeness math). */
export function fieldKeys(concern: Concern): string[] {
  return selectFields(concern).map((f) => f.key);
}
