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

const CTA_PATTERN =
  /\b(book|call|contact|discover|download|email|join|learn|let us know|read|register|reply|schedule|share|shop|subscribe|tell us|visit)\b|\?/iu;
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
      if (!CTA_PATTERN.test(trimmed)) warnings.push("Email requires one explicit call-to-action.");
      if (!hasEmailSignOff(trimmed)) warnings.push("Email requires a sign-off.");
      break;
    case "x":
      if ([...trimmed].length > 280) warnings.push("X content exceeds 280 characters.");
      break;
    case "linkedin":
      if (blocks.length < 3) warnings.push("LinkedIn requires a hook and at least two short body paragraphs.");
      if ((blocks[0]?.length ?? 0) > 240) warnings.push("LinkedIn opening hook is too long.");
      if (!CTA_PATTERN.test(trimmed)) warnings.push("LinkedIn requires one call-to-action or discussion question.");
      break;
    case "facebook":
      if (blocks.length < 2) warnings.push("Facebook requires a conversational opening and body paragraph.");
      if (!CTA_PATTERN.test(trimmed)) warnings.push("Facebook requires one clear community-focused action.");
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
      if (!CTA_PATTERN.test(trimmed)) warnings.push("Newsletter requires one clear call-to-action.");
      break;
    }
    case "blog": {
      if (!/^#\s+\S.+$/mu.test(trimmed)) warnings.push("Blog requires a `#` title.");
      const sections = trimmed.match(/^##\s+\S.+$/gmu) ?? [];
      if (sections.length < 3) warnings.push("Blog requires at least three `##` sections.");
      if (!CTA_PATTERN.test(trimmed)) warnings.push("Blog requires a concluding call-to-action.");
      break;
    }
  }

  return warnings;
}

interface ClaimAnchor {
  key: string;
  display: string;
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
  /(?:[$£€]\s?\d[\d,.]*|\b\d+(?:\.\d+)?\s?(?:%|percent|years?|days?|hours?|customers?|clients?|projects?|locations?|stars?)\b|\b(?:19|20)\d{2}\b)/giu;

function claimAnchors(sentence: string): ClaimAnchor[] {
  const anchors: ClaimAnchor[] = [];
  for (const claim of ABSOLUTE_CLAIMS) {
    const match = sentence.match(claim.pattern);
    if (match) anchors.push({ key: claim.key, display: match[0].toLocaleLowerCase() });
  }
  for (const match of sentence.matchAll(NUMERIC_CLAIM_PATTERN)) {
    const normalized = match[0].toLocaleLowerCase().replace(/\s+/g, " ").trim();
    anchors.push({ key: `numeric:${normalized}`, display: normalized });
  }
  return anchors;
}

function supportContainsAnchor(support: string, anchor: ClaimAnchor): boolean {
  if (anchor.key.startsWith("numeric:")) return support.includes(anchor.display);
  const matcher = ABSOLUTE_CLAIMS.find((claim) => claim.key === anchor.key);
  return matcher ? matcher.pattern.test(support) : false;
}

/**
 * Flags objective high-risk claims unless their exact anchor exists in approved
 * Company DNA or a cited Vault excerpt. Natural-language claims remain part of
 * the model critique; this gate handles numbers and absolute assertions.
 */
export function unsupportedClaimWarnings(
  body: string,
  supportText: string,
): string[] {
  const normalizedSupport = supportText.toLocaleLowerCase().replace(/\s+/g, " ");
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const warnings: string[] = [];

  for (const sentence of sentences) {
    if (/\[[^\]]+\]/u.test(sentence)) continue;
    const anchors = claimAnchors(sentence);
    if (!anchors.length) continue;
    const unsupported = anchors.filter((anchor) => !supportContainsAnchor(normalizedSupport, anchor));
    if (unsupported.length) {
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
