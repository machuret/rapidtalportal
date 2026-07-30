export const CONTENT_HARD_RULE_TYPES = [
  "prohibit_phrase",
  "require_phrase",
  "require_prefix",
  "require_suffix",
  "min_words",
  "max_words",
  "max_emojis",
] as const;

export type ContentHardRuleType = typeof CONTENT_HARD_RULE_TYPES[number];

export interface ContentHardRule {
  id: string;
  type: ContentHardRuleType;
  value?: string;
  limit?: number;
  /** Empty means every channel. */
  channels?: string[];
}

export interface ResolvedContentStyle {
  /** Complete human-readable rule list shown beside the generated draft. */
  summary: string[];
  /** Ordered instruction block injected into the generation and review prompts. */
  prompt: string;
  /** Terms/claims checked deterministically after generation and before approval. */
  prohibitedPhrases: string[];
  /** Whether Company DNA explicitly disallows emoji. */
  disallowEmoji: boolean;
  /** Validated, channel-applicable rules with deterministic enforcement. */
  hardRules: ContentHardRule[];
  /** Human-approved, evidence-backed channel profile used for this resolution. */
  styleAnalysis: ContentStyleAnalysisProvenance | null;
}

export interface ContentStyleAnalysisProvenance {
  id: string;
  channel: string;
  summary: string;
  sourceItemIds: string[];
  analysedAt: string | null;
  approvedAt: string | null;
}

export interface ContentStyleSnapshot {
  channel: string;
  summary: string[];
  hardRules: ContentHardRule[];
  styleAnalysis: ContentStyleAnalysisProvenance | null;
  companyDnaUpdatedAt: string | null;
  capturedAt: string;
  /** Frozen generation instructions used to keep later rewrites on-voice. */
  prompt?: string;
  prohibitedPhrases?: string[];
  disallowEmoji?: boolean;
  exampleSources?: Array<{
    itemId: string;
    title: string;
    sourceUrl: string | null;
  }>;
}

type Dna = Record<string, unknown> | null | undefined;

function text(dna: Dna, key: string): string {
  const value = dna?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function splitTerms(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2),
    ),
  ).slice(0, 100);
}

function splitClaims(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n;]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2),
    ),
  ).slice(0, 100);
}

function contentHardRules(dna: Dna, channel: string): ContentHardRule[] {
  if (!Array.isArray(dna?.hard_rules)) return [];
  const validTypes = new Set<string>(CONTENT_HARD_RULE_TYPES);
  const rules: ContentHardRule[] = [];

  for (const raw of dna.hard_rules.slice(0, 100)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !validTypes.has(String(row.type))) continue;
    const channels = Array.isArray(row.channels)
      ? row.channels.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [];
    if (channels.length && !channels.includes(channel)) continue;

    const type = row.type as ContentHardRuleType;
    if (["min_words", "max_words", "max_emojis"].includes(type)) {
      if (typeof row.limit !== "number" || !Number.isInteger(row.limit) || row.limit < 0) continue;
      rules.push({ id: row.id, type, limit: row.limit, channels });
      continue;
    }

    if (typeof row.value !== "string") continue;
    const value = row.value.trim();
    if (value.length < 1 || value.length > 300) continue;
    rules.push({ id: row.id, type, value, channels });
  }
  return rules;
}

function emojiIsDisallowed(policy: string): boolean {
  const normalized = policy.toLocaleLowerCase().trim();
  return (
    normalized === "none" ||
    /\b(no|zero)\s+emojis?\b/.test(normalized) ||
    /\b(without|avoid)\s+(using\s+)?emojis?\b/.test(normalized) ||
    /\b(never|do not|don't)\s+use\s+emojis?\b/.test(normalized)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(body: string, phrase: string): boolean {
  // For ordinary words/phrases, use token boundaries so "cheap" does not match
  // "cheaper". Punctuation-heavy rules retain literal substring semantics.
  if (/^[\p{L}\p{N}][\p{L}\p{N}\s'-]*[\p{L}\p{N}]$/u.test(phrase) || /^[\p{L}\p{N}]$/u.test(phrase)) {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(phrase)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(body);
  }
  return body.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

function channelStyle(dna: Dna, channel: string): string {
  const styles = dna?.channel_styles;
  if (!styles || typeof styles !== "object" || Array.isArray(styles)) return "";
  const raw = (styles as Record<string, unknown>)[channel];
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => `${key.replaceAll("_", " ")}: ${(value as string).trim()}`)
      .join("; ");
  }
  return "";
}

function approvedChannelAnalysis(
  dna: Dna,
  channel: string,
): { prompt: string; provenance: ContentStyleAnalysisProvenance } | null {
  const profiles = dna?.style_analysis_profiles;
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) return null;
  const raw = (profiles as Record<string, unknown>)[channel];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const analysis = row.analysis;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return null;
  const profile = analysis as Record<string, unknown>;
  if (profile.schema_version !== 1) return null;
  const summary = typeof profile.summary === "string" ? profile.summary.trim() : "";
  if (!summary || typeof row.id !== "string") return null;

  const scalarFields: Array<[string, string]> = [
    ["Tone", "tone"],
    ["Audience relationship", "audience_relationship"],
    ["Sentence style", "sentence_style"],
    ["Paragraph style", "paragraph_style"],
    ["Emoji usage", "emoji_usage"],
    ["Hashtag usage", "hashtag_usage"],
  ];
  const listFields: Array<[string, string]> = [
    ["Voice traits", "voice_traits"],
    ["Hook patterns", "hook_patterns"],
    ["Structure patterns", "structure_patterns"],
    ["Formatting patterns", "formatting_patterns"],
    ["Vocabulary patterns", "vocabulary_patterns"],
    ["CTA patterns", "cta_patterns"],
    ["Content patterns", "content_patterns"],
    ["Avoid patterns", "avoid_patterns"],
  ];
  const details = [
    `Summary: ${summary}`,
    ...scalarFields.flatMap(([label, key]) => {
      const value = profile[key];
      return typeof value === "string" && value.trim() ? [`${label}: ${value.trim()}`] : [];
    }),
    ...listFields.flatMap(([label, key]) => {
      const value = profile[key];
      if (!Array.isArray(value)) return [];
      const items = value.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ).slice(0, 10);
      return items.length ? [`${label}: ${items.join("; ")}`] : [];
    }),
  ];
  return {
    prompt: details.join("\n"),
    provenance: {
      id: row.id,
      channel,
      summary,
      sourceItemIds: Array.isArray(row.source_item_ids)
        ? row.source_item_ids.filter((item): item is string => typeof item === "string").slice(0, 50)
        : [],
      analysedAt: typeof row.analysed_at === "string" ? row.analysed_at : null,
      approvedAt: typeof row.approved_at === "string" ? row.approved_at : null,
    },
  };
}

function hardRuleSummary(rule: ContentHardRule): string {
  const channelLabel = rule.channels?.length ? ` (${rule.channels.join(", ")})` : "";
  switch (rule.type) {
    case "prohibit_phrase": return `Never use “${rule.value}”${channelLabel}`;
    case "require_phrase": return `Must include “${rule.value}”${channelLabel}`;
    case "require_prefix": return `Must start with “${rule.value}”${channelLabel}`;
    case "require_suffix": return `Must end with “${rule.value}”${channelLabel}`;
    case "min_words": return `Must contain at least ${rule.limit} words${channelLabel}`;
    case "max_words": return `Must contain no more than ${rule.limit} words${channelLabel}`;
    case "max_emojis": return `Must contain no more than ${rule.limit} emoji${channelLabel}`;
  }
}

/**
 * Resolve deliberate Company DNA writing rules. The ordering is load-bearing:
 * a brief/tone request can shape a draft, but never override Company DNA.
 * Natural-language guidance is model-enforced; prohibited phrases and explicit
 * no-emoji policies also receive deterministic checks.
 */
export function resolveContentStyle(
  dna: Dna,
  channel: string,
  requestedTone: string,
  lengthHint: string,
): ResolvedContentStyle {
  const hardRules = contentHardRules(dna, channel);
  const styleAnalysis = approvedChannelAnalysis(dna, channel);
  const rules: { label: string; value: string; summaryValue?: string; priority: number }[] = [
    { label: "Prohibited claims", value: text(dna, "prohibited_claims"), priority: 1 },
    { label: "Prohibited words or phrases", value: text(dna, "prohibited_terms"), priority: 1 },
    { label: "Deterministic hard rules", value: hardRules.map(hardRuleSummary).join("; "), priority: 1 },
    { label: "Priority company guidance", value: text(dna, "internal_rules"), priority: 2 },
    { label: "Brand voice", value: text(dna, "brand_voice"), priority: 3 },
    { label: "Writing style", value: text(dna, "content_style"), priority: 3 },
    { label: `${channel} style`, value: channelStyle(dna, channel), priority: 4 },
    {
      label: `Approved ${channel} style analysis`,
      value: styleAnalysis?.prompt ?? "",
      summaryValue: styleAnalysis?.provenance.summary,
      priority: 6,
    },
    { label: "Preferred words or phrases", value: text(dna, "preferred_terms"), priority: 5 },
    { label: "Spelling and locale", value: text(dna, "spelling_locale"), priority: 5 },
    { label: "Emoji policy", value: text(dna, "emoji_policy"), priority: 5 },
    { label: "Humour policy", value: text(dna, "humour_policy"), priority: 5 },
    { label: "CTA style", value: text(dna, "default_cta_style"), priority: 5 },
    { label: "Default sign-off", value: text(dna, "sign_off"), priority: 5 },
    { label: "Approved claims", value: text(dna, "approved_claims"), priority: 5 },
    { label: "Requested tone", value: requestedTone.trim(), priority: 7 },
    { label: "Requested length", value: lengthHint.trim(), priority: 7 },
  ]
    .filter((rule) => rule.value)
    .sort((left, right) => left.priority - right.priority);

  const prompt = [
    "=== WRITING STYLE AUTHORITY ===",
    "Follow these in priority order. A lower-priority request must never override a higher-priority rule.",
    ...rules.map((rule) => `${rule.priority}. ${rule.label}: ${rule.value}`),
  ].join("\n");

  return {
    summary: rules.map((rule) => `${rule.label}: ${rule.summaryValue ?? rule.value}`),
    prompt,
    prohibitedPhrases: Array.from(new Set([
      ...splitTerms(text(dna, "prohibited_terms")),
      ...splitClaims(text(dna, "prohibited_claims")),
    ])),
    disallowEmoji: emojiIsDisallowed(text(dna, "emoji_policy")),
    hardRules,
    styleAnalysis: styleAnalysis?.provenance ?? null,
  };
}

export function contentHardRuleWarnings(body: string, style: ResolvedContentStyle): string[] {
  const trimmed = body.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/u).length : 0;
  const emojiCount = body.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  return style.hardRules.flatMap((rule): string[] => {
    switch (rule.type) {
      case "prohibit_phrase":
        return rule.value && containsPhrase(body, rule.value)
          ? [`Remove prohibited hard-rule phrase: “${rule.value}”`]
          : [];
      case "require_phrase":
        return rule.value && !containsPhrase(body, rule.value)
          ? [`Add required hard-rule phrase: “${rule.value}”`]
          : [];
      case "require_prefix":
        return rule.value && !trimmed.toLocaleLowerCase().startsWith(rule.value.toLocaleLowerCase())
          ? [`Content must start with: “${rule.value}”`]
          : [];
      case "require_suffix":
        return rule.value && !trimmed.toLocaleLowerCase().endsWith(rule.value.toLocaleLowerCase())
          ? [`Content must end with: “${rule.value}”`]
          : [];
      case "min_words":
        return rule.limit !== undefined && wordCount < rule.limit
          ? [`Content requires at least ${rule.limit} words; found ${wordCount}.`]
          : [];
      case "max_words":
        return rule.limit !== undefined && wordCount > rule.limit
          ? [`Content allows at most ${rule.limit} words; found ${wordCount}.`]
          : [];
      case "max_emojis":
        return rule.limit !== undefined && emojiCount > rule.limit
          ? [`Content allows at most ${rule.limit} emoji; found ${emojiCount}.`]
          : [];
    }
  }).slice(0, 20);
}

export function contentStyleWarnings(body: string, style: ResolvedContentStyle): string[] {
  const phraseWarnings = style.prohibitedPhrases
    .filter((phrase) => containsPhrase(body, phrase))
    .slice(0, 12)
    .map((phrase) => `Review prohibited phrase: “${phrase}”`);
  const emojiWarnings =
    style.disallowEmoji && /\p{Extended_Pictographic}/u.test(body)
      ? ["Remove emoji: Company DNA disallows them for this content."]
      : [];
  const hardRuleWarnings = contentHardRuleWarnings(body, style);
  return [...phraseWarnings, ...emojiWarnings, ...hardRuleWarnings].slice(0, 20);
}

export function createContentStyleSnapshot(
  style: ResolvedContentStyle,
  channel: string,
  companyDnaUpdatedAt: string | null,
  capturedAt = new Date().toISOString(),
): ContentStyleSnapshot {
  return {
    channel,
    summary: style.summary,
    hardRules: style.hardRules,
    styleAnalysis: style.styleAnalysis,
    companyDnaUpdatedAt,
    capturedAt,
    prompt: style.prompt,
    prohibitedPhrases: style.prohibitedPhrases,
    disallowEmoji: style.disallowEmoji,
  };
}
