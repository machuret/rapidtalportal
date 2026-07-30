import type { ResolvedContentStyle } from "./content-style.ts";
import { contentStyleWarnings } from "./content-style.ts";

export type QualityContentType =
  | "email"
  | "x"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "newsletter"
  | "blog"
  | "message"
  | "other";

/**
 * Stable output contracts shared by generation and tests. These instructions
 * intentionally describe one platform artifact at a time.
 */
export const CONTENT_TYPE_INSTRUCTIONS: Record<QualityContentType, string> = {
  email: "Write one professional business email in this order: `Subject: ...`, greeting, concise body paragraphs, one explicit call-to-action, and sign-off. Do not add another platform variant.",
  x: "Write one X / Twitter post within 280 characters. Lead with the key point, keep it natural and specific, and avoid hashtag stuffing. Do not write variants for other platforms.",
  linkedin: "Write one LinkedIn post with a short opening hook, at least two short body paragraphs, a useful company-specific insight, and exactly one natural call-to-action or discussion question. Do not write Facebook or Instagram variants.",
  facebook: "Write one Facebook post with a conversational opening, at least one short body paragraph, and one clear community-focused action. Do not write LinkedIn or Instagram variants.",
  instagram: "Write one Instagram artifact with the exact sections `Caption:` and `Visual direction:`, followed by 2-8 relevant hashtags. Keep it punchy and on-brand. Do not write LinkedIn or Facebook variants.",
  message: "Write one concise chat or WhatsApp-style message. Keep it natural, direct and ready to send.",
  other: "Write one polished, ready-to-use business communication in plain text.",
  newsletter: "Write one client newsletter with `Subject:`, a `#` headline, at least two `##` sections, a featured insight or practical tip, and one clear CTA. Aim for 400-600 words.",
  blog: "Write one blog post with a `#` SEO-friendly title, engaging introduction, at least three `##` sections, practical examples, and a concluding CTA. Aim for 600-900 words.",
};

const CTA_ACTION =
  "(?:book|call|contact|discover|download|email|join|learn more|let us know|read(?: more)?|register|reply|schedule|shop|subscribe|tell us|visit)";
const CTA_START_PATTERN = new RegExp(
  `^(?:(?:please|to get started|to learn more|when you're ready),?\\s+)?${CTA_ACTION}\\b`,
  "iu",
);
const CTA_INVITATION_PATTERN = new RegExp(
  `\\b(?:you can|we invite you to|ready to|want to|the next step is to)\\s+${CTA_ACTION}\\b`,
  "iu",
);
const CTA_CLAUSE_PATTERN = new RegExp(`,\\s*(?:please\\s+)?${CTA_ACTION}\\b`, "iu");
const SHARE_CTA_PATTERN = /^share\s+(?:this|your|with|below|in)\b/iu;
const GREETING_PATTERN = /^(hi|hello|dear|good (morning|afternoon|evening))\b/imu;
const SIGN_OFF_PATTERN =
  /^(kind regards|regards|best regards|best|thanks|thank you|warm regards|sincerely|yours sincerely|yours faithfully|with appreciation|all the best|respectfully|cheers)[,!]?\s*$/imu;

function paragraphs(body: string): string[] {
  return body
    .trim()
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function words(body: string): number {
  const normalized = body.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function ctaUnits(body: string): string[] {
  const units = body
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  return units.filter((unit, index) => {
    const questionBeforeEmailSignOff =
      unit.endsWith("?") &&
      units.length - index <= 3 &&
      SIGN_OFF_PATTERN.test(units[index + 1] ?? "");
    return (
    CTA_START_PATTERN.test(unit) ||
    CTA_INVITATION_PATTERN.test(unit) ||
    CTA_CLAUSE_PATTERN.test(unit) ||
    SHARE_CTA_PATTERN.test(unit) ||
    (index === units.length - 1 && unit.endsWith("?")) ||
    questionBeforeEmailSignOff
    );
  });
}

function requireExactCtaCount(warnings: string[], body: string, label: string, expected = 1): void {
  const count = ctaUnits(body).length;
  if (count !== expected) {
    warnings.push(`${label} requires exactly ${expected} call-to-action or discussion question; found ${count}.`);
  }
}

function compact(value: string, limit = 180): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit - 1)}…` : oneLine;
}

function hasEmailSignOff(body: string): boolean {
  if (SIGN_OFF_PATTERN.test(body)) return true;
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const closing = lines.at(-2) ?? "";
  const sender = lines.at(-1) ?? "";
  return (
    closing.length >= 2 &&
    closing.length <= 60 &&
    sender.length >= 2 &&
    sender.length <= 80 &&
    !/[.!?]$/u.test(closing)
  );
}

/** Deterministic checks for the six editorial formats plus X. */
export function contentStructureWarnings(
  body: string,
  contentType: string,
): string[] {
  const warnings: string[] = [];
  const trimmed = body.trim();
  const blocks = paragraphs(trimmed);

  if (!trimmed) return ["Content is empty."];

  switch (contentType) {
    case "email":
      if (!/^Subject:\s*\S.+$/imu.test(trimmed)) warnings.push("Email requires a `Subject:` line.");
      if (!GREETING_PATTERN.test(trimmed)) warnings.push("Email requires a greeting.");
      requireExactCtaCount(warnings, trimmed, "Email");
      if (!hasEmailSignOff(trimmed)) warnings.push("Email requires a sign-off.");
      break;
    case "x":
      if ([...trimmed].length > 280) warnings.push("X content exceeds 280 characters.");
      break;
    case "linkedin":
      if (blocks.length < 3) warnings.push("LinkedIn requires a hook and at least two short body paragraphs.");
      if ((blocks[0]?.length ?? 0) > 240) warnings.push("LinkedIn opening hook is too long.");
      requireExactCtaCount(warnings, trimmed, "LinkedIn");
      break;
    case "facebook":
      if (blocks.length < 2) warnings.push("Facebook requires a conversational opening and body paragraph.");
      requireExactCtaCount(warnings, trimmed, "Facebook");
      break;
    case "instagram": {
      if (!/^Caption:\s*$/imu.test(trimmed)) warnings.push("Instagram requires a `Caption:` section.");
      if (!/^Visual direction:\s*\S.+$/imu.test(trimmed)) warnings.push("Instagram requires a `Visual direction:` section.");
      const hashtags = trimmed.match(/#[\p{L}\p{N}_]+/gu) ?? [];
      if (hashtags.length < 2 || hashtags.length > 8) {
        warnings.push("Instagram requires 2-8 relevant hashtags.");
      }
      break;
    }
    case "newsletter": {
      if (!/^Subject:\s*\S.+$/imu.test(trimmed)) warnings.push("Newsletter requires a `Subject:` line.");
      if (!/^#\s+\S.+$/mu.test(trimmed)) warnings.push("Newsletter requires a `#` headline.");
      const sections = trimmed.match(/^##\s+\S.+$/gmu) ?? [];
      if (sections.length < 2) warnings.push("Newsletter requires at least two `##` sections.");
      const wordCount = words(trimmed);
      if (wordCount < 400 || wordCount > 600) {
        warnings.push(`Newsletter requires 400-600 words; found ${wordCount}.`);
      }
      requireExactCtaCount(warnings, trimmed, "Newsletter");
      break;
    }
    case "blog": {
      if (!/^#\s+\S.+$/mu.test(trimmed)) warnings.push("Blog requires a `#` title.");
      const sections = trimmed.match(/^##\s+\S.+$/gmu) ?? [];
      if (sections.length < 3) warnings.push("Blog requires at least three `##` sections.");
      const wordCount = words(trimmed);
      if (wordCount < 600 || wordCount > 900) {
        warnings.push(`Blog requires 600-900 words; found ${wordCount}.`);
      }
      const finalBlock = blocks.at(-1) ?? "";
      if (!ctaUnits(finalBlock).length) warnings.push("Blog requires a concluding call-to-action.");
      break;
    }
  }

  return warnings;
}

interface ClaimAnchor {
  key: string;
  display: string;
  pattern: RegExp;
  negated: boolean;
}

const ABSOLUTE_CLAIMS: { key: string; pattern: RegExp }[] = [
  { key: "guarantee", pattern: /\bguarantee(?:d|s)?\b/iu },
  { key: "award-winning", pattern: /\baward[- ]winning\b/iu },
  { key: "certified", pattern: /\bcertified\b/iu },
  { key: "accredited", pattern: /\baccredited\b/iu },
  { key: "number-one", pattern: /(?:#\s*1\b|\bnumber\s+one\b)/iu },
  { key: "market-leading", pattern: /\b(?:industry|market)[- ]leading\b/iu },
  { key: "largest", pattern: /\blargest\b/iu },
  { key: "fastest", pattern: /\bfastest\b/iu },
];

const NUMERIC_CLAIM_PATTERN =
  /(?:[$£€]\s?\d[\d,.]*|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?(?:percent|years?|days?|hours?|customers?|clients?|projects?|locations?|stars?)\b|\b(?:19|20)\d{2}\b)/giu;

function claimAnchors(sentence: string): ClaimAnchor[] {
  const anchors: ClaimAnchor[] = [];
  for (const claim of ABSOLUTE_CLAIMS) {
    const match = sentence.match(claim.pattern);
    if (match) anchors.push({
      key: claim.key,
      display: match[0].toLocaleLowerCase(),
      pattern: claim.pattern,
      negated: false,
    });
  }
  for (const match of sentence.matchAll(NUMERIC_CLAIM_PATTERN)) {
    const normalized = match[0].toLocaleLowerCase().replace(/\s+/g, " ").trim();
    anchors.push({
      key: `numeric:${normalized}`,
      display: normalized,
      pattern: new RegExp(escapeRegExp(normalized).replace(/\\ /g, "\\s*"), "iu"),
      negated: false,
    });
  }
  return anchors.map((anchor) => ({
    ...anchor,
    negated: anchorIsNegated(sentence, anchor),
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NEGATION_PATTERN =
  /\b(no|not|never|without|cannot|can't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|won't)\b/iu;
const CLAIM_STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "being", "can", "could",
  "for", "from", "have", "into", "its", "our", "that", "the", "their", "them",
  "they", "this", "those", "was", "were", "will", "with", "would", "your",
  "business", "charge", "charges", "company", "deliver", "delivers", "has", "integrate", "integrates",
  "offer", "offers", "operate", "operates", "platform", "provide", "provides",
  "serve", "serves", "service", "services", "support", "supports", "team", "use",
  "uses", "we",
  "guarantee", "guaranteed", "award", "winning", "certified", "accredited",
  "number", "one", "industry", "market", "leading", "largest", "fastest",
]);

const DIRECT_COMPANY_FACT_PATTERN =
  /\b(?:we|our company|our business|our team|our platform|our (?:product|service)s?|the company|the business)\s+(?:(?:do|does)\s+not\s+)?(?:has|have|provides?|offers?|operates?|serves?|supports?|integrates?|uses?|charges?|employs?|maintains?|speciali[sz]es?|delivers?|includes?|covers?|accepts?|complies?|partners?)\b/iu;
const OUR_NOUN_FACT_PATTERN =
  /\bour\s+[\p{L}\p{N}'’-]+(?:\s+[\p{L}\p{N}'’-]+)?\s+(?:(?:is|are|was|were)|(?:(?:do|does)\s+not\s+)?(?:has|provides?|offers?|operates?|serves?|supports?|integrates?|uses?|charges?|employs?|maintains?|speciali[sz]es?|delivers?|includes?|covers?|accepts?|complies?|partners?))\b/iu;
const WE_COPULA_FACT_PATTERN =
  /\bwe\s+(?:are|were)\s+(?:(?:not|fully|currently|independently|locally|an?)\s+){0,3}(?:accredited|authori[sz]ed|based|certified|headquartered|licensed|located|members?|owned|partners?|providers?|registered|regulated)\b/iu;
const PROPER_NAME_FACT_PATTERN =
  /^[\p{Lu}][\p{L}\p{N}&'’-]*\s+[\p{Lu}][\p{L}\p{N}&'’-]*(?:\s+[\p{Lu}][\p{L}\p{N}&'’-]*){0,4}\s+(?:is|are|has|provides?|offers?|operates?|serves?|supports?|integrates?|uses?|charges?|speciali[sz]es?|delivers?)\b/u;
const SUBJECTIVE_COMPANY_PATTERN =
  /\bwe\s+(?:believe|think|hope|aim|want|invite|encourage|recommend)\b/iu;

function stripPlaceholders(sentence: string): string {
  return sentence.replace(/\[[^\]\r\n]{1,160}\]/gu, " ");
}

function anchorIsNegated(sentence: string, anchor: ClaimAnchor): boolean {
  const match = sentence.match(anchor.pattern);
  if (!match || match.index === undefined) return false;
  const before = sentence.slice(Math.max(0, match.index - 55), match.index);
  const after = sentence.slice(match.index + match[0].length, match.index + match[0].length + 30);
  const nearestWords = before.trim().split(/\s+/u).slice(-3).join(" ");
  return NEGATION_PATTERN.test(nearestWords) ||
    /^\s*(?:is|are|was|were)?\s*(?:not|never|without)\b/iu.test(after);
}

function meaningfulClaimTerms(sentence: string): string[] {
  return Array.from(new Set(
    sentence
      .toLocaleLowerCase()
      .replace(NUMERIC_CLAIM_PATTERN, " ")
      .replace(/[^\p{L}\p{N}'-]+/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length >= 3 && !CLAIM_STOP_WORDS.has(word)),
  ));
}

function isNaturalCompanyClaim(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (
    trimmed.endsWith("?") ||
    trimmed.split(/\s+/u).length < 4 ||
    SUBJECTIVE_COMPANY_PATTERN.test(trimmed)
  ) {
    return false;
  }
  return (
    DIRECT_COMPANY_FACT_PATTERN.test(trimmed) ||
    OUR_NOUN_FACT_PATTERN.test(trimmed) ||
    WE_COPULA_FACT_PATTERN.test(trimmed) ||
    PROPER_NAME_FACT_PATTERN.test(trimmed)
  );
}

function sentenceIsNegated(sentence: string): boolean {
  return NEGATION_PATTERN.test(sentence);
}

function sentenceSupportsClaim(
  claimSentence: string,
  anchors: ClaimAnchor[],
  supportSentence: string,
  naturalClaim: boolean,
): boolean {
  if (!anchors.every((anchor) =>
    anchor.pattern.test(supportSentence) &&
    anchorIsNegated(supportSentence, anchor) === anchor.negated
  )) {
    return false;
  }
  if (
    naturalClaim &&
    sentenceIsNegated(claimSentence) !== sentenceIsNegated(supportSentence)
  ) {
    return false;
  }
  const claimTerms = meaningfulClaimTerms(claimSentence);
  if (!claimTerms.length) return true;
  const supportTerms = new Set(meaningfulClaimTerms(supportSentence));
  const overlap = claimTerms.filter((term) => supportTerms.has(term)).length;
  const requiredOverlap = naturalClaim
    ? Math.max(Math.min(2, claimTerms.length), Math.ceil(Math.min(claimTerms.length, 8) * 0.5))
    : Math.max(1, Math.ceil(Math.min(claimTerms.length, 4) * 0.4));
  return overlap >= requiredOverlap;
}

/**
 * Flags high-risk and ordinary company assertions unless a sentence with the
 * same claim polarity and enough material terms exists in approved Company DNA
 * or a cited Vault excerpt.
 */
export function unsupportedClaimWarnings(
  body: string,
  supportText: string,
): string[] {
  const supportSentences = supportText
    .split(/(?<=[.!?])\s+|\n+|;\s*/u)
    .map((part) => stripPlaceholders(part).trim())
    .filter(Boolean);
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const warnings: string[] = [];

  for (const sentence of sentences) {
    const claimText = stripPlaceholders(sentence);
    const anchors = claimAnchors(claimText);
    const naturalClaim = isNaturalCompanyClaim(claimText);
    if (!anchors.length && !naturalClaim) continue;
    const supported = supportSentences.some((supportSentence) =>
      sentenceSupportsClaim(claimText, anchors, supportSentence, naturalClaim)
    );
    if (!supported) {
      warnings.push(`Unsupported factual claim: “${compact(sentence)}”`);
    }
    if (warnings.length >= 8) break;
  }

  return warnings;
}

export function contentQualityWarnings(args: {
  body: string;
  contentType: string;
  style: ResolvedContentStyle;
  claimSupportText: string;
  enforceStructure?: boolean;
}): string[] {
  return Array.from(new Set([
    ...contentStyleWarnings(args.body, args.style),
    ...unsupportedClaimWarnings(args.body, args.claimSupportText),
    ...(args.enforceStructure === false
      ? []
      : contentStructureWarnings(args.body, args.contentType)),
  ])).slice(0, 20);
}

export function claimSupportFromDna(
  dna: Record<string, unknown> | null | undefined,
  sourceExcerpts: string[] = [],
): string {
  const supportedFields = [
    "company_name",
    "services",
    "location",
    "team",
    "tools_used",
    "approved_claims",
  ];
  const values = supportedFields
    .map((field) => dna?.[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (dna?.extra && typeof dna.extra === "object") {
    values.push(JSON.stringify(dna.extra));
  }
  return [...values, ...sourceExcerpts].join("\n");
}
