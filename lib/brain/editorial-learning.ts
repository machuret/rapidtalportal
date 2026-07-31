export const EDITORIAL_DIMENSIONS = [
  "topic",
  "voice",
  "hook",
  "structure",
  "audience",
  "useful_detail",
  "cta",
  "length",
  "vocabulary",
  "promotional_intensity",
  "paragraph_length",
  "heading_structure",
  "lists",
  "emoji",
  "sentence_length",
  "point_of_view",
  "claims",
  "formatting",
] as const;

export type EditorialDimension = (typeof EDITORIAL_DIMENSIONS)[number];
export type EditorialClassification =
  | "content_specific"
  | "company_factual"
  | "voice_preference"
  | "channel_preference"
  | "format_preference"
  | "hard_rule_candidate"
  | "one_off";
export type EditorialOutcome =
  | "brain_preference"
  | "brain_anti_pattern"
  | "company_dna_update"
  | "channel_style_update"
  | "vault_correction"
  | "no_reusable_learning";

export interface EditorialAnalysis {
  meaningful: boolean;
  dimensions: EditorialDimension[];
  classification: EditorialClassification;
  outcome: EditorialOutcome;
  summary: string;
  suggestedLesson: string;
  explanation: string;
  beforeExcerpt: string;
  afterExcerpt: string;
  confidence: number;
}

const SALES_WORDS = /\b(buy|book|limited|exclusive|offer|deal|act now|don't miss|contact us today|transform|unlock|game[- ]?changer)\b/gi;
const FIRST_PERSON = /\b(i|we|our|us|my)\b/gi;
const COMPANY_VOICE = /\b(the company|the team|the business|it|its)\b/gi;
const FACTUAL_MARKERS = /\b(based in|located in|office|headquarters|founded|established|employs?|revenue|turnover|address|phone|email|licen[cs]ed|certified)\b/i;
const NUMBER_OR_MONEY = /(?:[$£€]\s?\d|\b\d+(?:[.,]\d+)?%?\b)/;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu;

function words(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

function firstNonEmptyLine(value: string): string {
  return value.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? "";
}

function lastNonEmptyLine(value: string): string {
  return value.split(/\n+/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function paragraphAverage(value: string): number {
  return average(value.split(/\n\s*\n/).map((paragraph) => words(paragraph).length).filter(Boolean));
}

function sentenceAverage(value: string): number {
  return average(value.split(/[.!?]+/).map((sentence) => words(sentence).length).filter(Boolean));
}

function changedWordCount(before: string, after: string): number {
  const left = words(before);
  const right = words(after);
  const common = new Map<string, number>();
  for (const word of left) common.set(word, (common.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of right) {
    const remaining = common.get(word) ?? 0;
    if (remaining > 0) {
      shared++;
      common.set(word, remaining - 1);
    }
  }
  return left.length + right.length - (shared * 2);
}

function excerpt(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 500);
}

function hasList(value: string): boolean {
  return /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S/m.test(value);
}

function hasHeading(value: string): boolean {
  return /(?:^|\n)\s*(?:#{1,4}\s+|[A-Z][^.!?]{2,60}:)\s*$/m.test(value);
}

function factualChange(before: string, after: string): boolean {
  const beforeChanged = before.split(/(?<=[.!?])\s+/).filter((sentence) =>
    FACTUAL_MARKERS.test(sentence) || NUMBER_OR_MONEY.test(sentence)
  );
  const afterChanged = after.split(/(?<=[.!?])\s+/).filter((sentence) =>
    FACTUAL_MARKERS.test(sentence) || NUMBER_OR_MONEY.test(sentence)
  );
  return beforeChanged.join(" ").toLocaleLowerCase() !== afterChanged.join(" ").toLocaleLowerCase()
    && (beforeChanged.length > 0 || afterChanged.length > 0);
}

export function analyseEditorialChange(input: {
  before: string;
  after: string;
  channel?: string | null;
  contentType?: string | null;
  priorSimilarEdits?: number;
}): EditorialAnalysis {
  const before = input.before.trim();
  const after = input.after.trim();
  const delta = changedWordCount(before, after);
  const beforeWords = words(before).length;
  const afterWords = words(after).length;
  const base = {
    beforeExcerpt: excerpt(before),
    afterExcerpt: excerpt(after),
  };

  if (!before || !after || before === after || delta <= 2) {
    return {
      ...base,
      meaningful: false,
      dimensions: [],
      classification: "one_off",
      outcome: "no_reusable_learning",
      summary: "Minor edit",
      suggestedLesson: "",
      explanation: "This change is too small to support a reusable lesson.",
      confidence: 100,
    };
  }

  const dimensions = new Set<EditorialDimension>();
  const notes: string[] = [];
  const beforeHook = firstNonEmptyLine(before);
  const afterHook = firstNonEmptyLine(after);
  if (beforeHook !== afterHook && changedWordCount(beforeHook, afterHook) >= 3) {
    dimensions.add("hook");
    notes.push(afterHook.length < beforeHook.length ? "shortened the opening" : "changed the opening");
  }

  const wordRatio = beforeWords ? afterWords / beforeWords : 1;
  if (wordRatio <= 0.82 || wordRatio >= 1.22) {
    dimensions.add("length");
    notes.push(wordRatio < 1 ? "made the draft shorter" : "added more detail");
  }

  const beforePromo = countMatches(before, SALES_WORDS);
  const afterPromo = countMatches(after, SALES_WORDS);
  if (beforePromo !== afterPromo) {
    dimensions.add("promotional_intensity");
    dimensions.add("voice");
    notes.push(afterPromo < beforePromo ? "reduced sales language" : "increased promotional language");
  }

  const beforeCta = lastNonEmptyLine(before);
  const afterCta = lastNonEmptyLine(after);
  if (beforeCta !== afterCta && changedWordCount(beforeCta, afterCta) >= 2) {
    dimensions.add("cta");
    notes.push(afterCta.endsWith("?") ? "changed the CTA to a discussion question" : "changed the CTA");
  }

  const beforeParagraph = paragraphAverage(before);
  const afterParagraph = paragraphAverage(after);
  if (beforeParagraph && Math.abs(afterParagraph - beforeParagraph) / beforeParagraph >= 0.25) {
    dimensions.add("paragraph_length");
    dimensions.add("structure");
    notes.push(afterParagraph < beforeParagraph ? "used shorter paragraphs" : "used longer paragraphs");
  }

  const beforeSentence = sentenceAverage(before);
  const afterSentence = sentenceAverage(after);
  if (beforeSentence && Math.abs(afterSentence - beforeSentence) / beforeSentence >= 0.25) {
    dimensions.add("sentence_length");
  }
  if (hasList(before) !== hasList(after)) {
    dimensions.add("lists");
    dimensions.add("structure");
    notes.push(hasList(after) ? "added a list" : "removed list formatting");
  }
  if (hasHeading(before) !== hasHeading(after)) {
    dimensions.add("heading_structure");
    dimensions.add("structure");
  }
  if (countMatches(before, EMOJI) !== countMatches(after, EMOJI)) {
    dimensions.add("emoji");
    notes.push(countMatches(after, EMOJI) ? "changed emoji use" : "removed emoji");
  }
  const beforeFirstPerson = countMatches(before, FIRST_PERSON);
  const afterFirstPerson = countMatches(after, FIRST_PERSON);
  const beforeCompany = countMatches(before, COMPANY_VOICE);
  const afterCompany = countMatches(after, COMPANY_VOICE);
  if ((beforeFirstPerson !== afterFirstPerson || beforeCompany !== afterCompany) && delta >= 5) {
    dimensions.add("point_of_view");
    dimensions.add("voice");
    notes.push(afterFirstPerson > beforeFirstPerson ? "moved toward first-person voice" : "changed the point of view");
  }

  if (factualChange(before, after)) {
    dimensions.add("claims");
    return {
      ...base,
      meaningful: true,
      dimensions: [...dimensions],
      classification: "company_factual",
      outcome: FACTUAL_MARKERS.test(`${before} ${after}`) ? "company_dna_update" : "vault_correction",
      summary: "Possible company fact correction",
      suggestedLesson: "Review and correct this company fact in Company DNA or the Vault.",
      explanation: "A factual statement, number or company detail changed. Route this to Company DNA or the Vault instead of teaching it as writing style.",
      confidence: 88,
    };
  }

  if (dimensions.size === 0 || (delta < 8 && wordRatio > 0.9 && wordRatio < 1.1)) {
    return {
      ...base,
      meaningful: false,
      dimensions: [...dimensions],
      classification: "one_off",
      outcome: "no_reusable_learning",
      summary: "One-off wording edit",
      suggestedLesson: "",
      explanation: "The change does not show a strong, reusable editorial pattern.",
      confidence: 82,
    };
  }

  const formatDimensions: EditorialDimension[] = [
    "structure", "paragraph_length", "heading_structure", "lists", "formatting",
  ];
  const isFormat = [...dimensions].some((dimension) => formatDimensions.includes(dimension));
  const repeated = (input.priorSimilarEdits ?? 0) > 0;
  const outcome: EditorialOutcome = repeated && (dimensions.has("hook") || isFormat)
    ? "channel_style_update"
    : afterPromo > beforePromo
      ? "brain_preference"
      : beforePromo > afterPromo
        ? "brain_anti_pattern"
        : isFormat
          ? "channel_style_update"
          : "brain_preference";
  const classification: EditorialClassification = outcome === "channel_style_update"
    ? "channel_preference"
    : dimensions.has("voice")
      ? "voice_preference"
      : isFormat
        ? "format_preference"
      : "content_specific";
  const suggestedLesson = dimensions.has("promotional_intensity") && afterPromo < beforePromo
    ? `Avoid generic or high-pressure promotional language${input.channel ? ` in ${input.channel} content` : ""}.`
    : dimensions.has("cta") && afterCta.endsWith("?")
      ? `Prefer discussion-question calls to action${input.channel ? ` for ${input.channel}` : ""}.`
      : dimensions.has("hook") && afterHook.length < beforeHook.length
        ? `Prefer concise, direct openings${input.channel ? ` for ${input.channel}` : ""}.`
        : dimensions.has("paragraph_length") && afterParagraph < beforeParagraph
          ? `Prefer shorter, easier-to-scan paragraphs${input.channel ? ` for ${input.channel}` : ""}.`
          : dimensions.has("point_of_view") && afterFirstPerson > beforeFirstPerson
            ? `Prefer first-person voice${input.contentType ? ` for ${input.contentType.replaceAll("_", " ")}` : ""}.`
            : `Prefer the edited ${[...dimensions][0]?.replaceAll("_", " ") ?? "style"} pattern for comparable content.`;

  return {
    ...base,
    meaningful: true,
    dimensions: [...dimensions],
    classification,
    outcome,
    summary: notes.length
      ? `You ${notes.slice(0, 3).join(", ").replace(/, ([^,]*)$/, " and $1")}.`
      : "You made a meaningful editorial change.",
    suggestedLesson,
    explanation: repeated
      ? `This resembles an earlier ${input.channel ?? "channel"} edit and may be reusable. You decide whether the Brain should remember it.`
      : "This may reflect a reusable preference, but it will not be learned unless you explicitly choose a teaching action.",
    confidence: repeated ? 86 : 72,
  };
}

export const POSITIVE_FEEDBACK_REASONS = [
  "Sounds like us",
  "Strong topic",
  "Good hook",
  "Good structure",
  "Correct audience",
  "Useful detail",
  "Good CTA",
  "Other",
] as const;

export const NEGATIVE_FEEDBACK_REASONS = [
  "Wrong topic",
  "Wrong voice",
  "Too generic",
  "Too promotional",
  "Too long",
  "Too short",
  "Repetitive",
  "Wrong audience",
  "Wrong structure",
  "Wrong CTA",
  "Other",
] as const;

export function dimensionsForFeedbackReason(reason: string): EditorialDimension[] {
  const mapping: Record<string, EditorialDimension[]> = {
    "Sounds like us": ["voice"],
    "Strong topic": ["topic"],
    "Good hook": ["hook"],
    "Good structure": ["structure"],
    "Correct audience": ["audience"],
    "Useful detail": ["useful_detail"],
    "Good CTA": ["cta"],
    "Wrong topic": ["topic"],
    "Wrong voice": ["voice"],
    "Too generic": ["voice", "vocabulary"],
    "Too promotional": ["promotional_intensity", "voice"],
    "Too long": ["length"],
    "Too short": ["length"],
    "Repetitive": ["structure", "vocabulary"],
    "Wrong audience": ["audience"],
    "Wrong structure": ["structure"],
    "Wrong CTA": ["cta"],
  };
  return mapping[reason] ?? [];
}
