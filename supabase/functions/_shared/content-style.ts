export interface ResolvedContentStyle {
  /** Complete human-readable rule list shown beside the generated draft. */
  summary: string[];
  /** Ordered instruction block injected into the generation and review prompts. */
  prompt: string;
  /** Terms/claims checked deterministically after generation and before approval. */
  prohibitedPhrases: string[];
  /** Whether Company DNA explicitly disallows emoji. */
  disallowEmoji: boolean;
}

export interface ContentStyleSnapshot {
  channel: string;
  summary: string[];
  companyDnaUpdatedAt: string | null;
  capturedAt: string;
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
  const rules: { label: string; value: string; priority: number }[] = [
    { label: "Prohibited claims", value: text(dna, "prohibited_claims"), priority: 1 },
    { label: "Prohibited words or phrases", value: text(dna, "prohibited_terms"), priority: 1 },
    { label: "Priority company guidance", value: text(dna, "internal_rules"), priority: 2 },
    { label: "Brand voice", value: text(dna, "brand_voice"), priority: 3 },
    { label: "Writing style", value: text(dna, "content_style"), priority: 3 },
    { label: `${channel} style`, value: channelStyle(dna, channel), priority: 4 },
    { label: "Preferred words or phrases", value: text(dna, "preferred_terms"), priority: 5 },
    { label: "Spelling and locale", value: text(dna, "spelling_locale"), priority: 5 },
    { label: "Emoji policy", value: text(dna, "emoji_policy"), priority: 5 },
    { label: "Humour policy", value: text(dna, "humour_policy"), priority: 5 },
    { label: "CTA style", value: text(dna, "default_cta_style"), priority: 5 },
    { label: "Default sign-off", value: text(dna, "sign_off"), priority: 5 },
    { label: "Approved claims", value: text(dna, "approved_claims"), priority: 5 },
    { label: "Requested tone", value: requestedTone.trim(), priority: 6 },
    { label: "Requested length", value: lengthHint.trim(), priority: 6 },
  ].filter((rule) => rule.value);

  const prompt = [
    "=== WRITING STYLE AUTHORITY ===",
    "Follow these in priority order. A lower-priority request must never override a higher-priority rule.",
    ...rules.map((rule) => `${rule.priority}. ${rule.label}: ${rule.value}`),
  ].join("\n");

  return {
    summary: rules.map((rule) => `${rule.label}: ${rule.value}`),
    prompt,
    prohibitedPhrases: Array.from(new Set([
      ...splitTerms(text(dna, "prohibited_terms")),
      ...splitClaims(text(dna, "prohibited_claims")),
    ])),
    disallowEmoji: emojiIsDisallowed(text(dna, "emoji_policy")),
  };
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
  return [...phraseWarnings, ...emojiWarnings].slice(0, 12);
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
    companyDnaUpdatedAt,
    capturedAt,
  };
}
