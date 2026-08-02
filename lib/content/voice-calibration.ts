import { createHash } from "node:crypto";
import { z } from "zod";
import {
  STYLE_ANALYSIS_CHANNELS,
  type StyleAnalysisChannel,
  type StyleAnalysisRecord,
  type StyleAnalysisSource,
} from "@/lib/content/style-analysis";

export const goldenExampleInputSchema = z.object({
  client_id: z.string().uuid(),
  channel: z.enum(STYLE_ANALYSIS_CHANNELS),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().min(40).max(50000),
  source_url: z.url().optional().nullable(),
  published_at: z.iso.datetime({ offset: true }).optional().nullable(),
  content_type: z.string().trim().min(1).max(120),
  represents_brand_strongly: z.boolean().default(true),
  voice_traits: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  structural_traits: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  vocabulary_preferences: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  admin_notes: z.string().trim().max(4000).optional().nullable(),
  evaluation_permission: z.boolean().default(false),
});

export const goldenExampleUpdateSchema = goldenExampleInputSchema
  .omit({ client_id: true })
  .partial()
  .extend({
    client_id: z.string().uuid(),
    id: z.string().uuid(),
    status: z.enum(["proposed", "approved", "archived"]).optional(),
    expected_updated_at: z.iso.datetime({ offset: true }),
  });

export interface ContentGoldenExample {
  id: string;
  client_id: string;
  channel: StyleAnalysisChannel;
  title: string;
  body: string;
  source_url: string | null;
  published_at: string | null;
  content_type: string;
  represents_brand_strongly: boolean;
  voice_traits: string[];
  structural_traits: string[];
  vocabulary_preferences: string[];
  admin_notes: string | null;
  evaluation_permission: boolean;
  status: "proposed" | "approved" | "archived";
  content_hash: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleCalibrationDiagnostic {
  code:
    | "insufficient_examples"
    | "low_channel_confidence"
    | "too_generic"
    | "too_restrictive"
    | "contradictory"
    | "outdated"
    | "promotional_skew"
    | "competitor_similarity"
    | "channel_inconsistency";
  severity: "info" | "warning" | "blocking";
  message: string;
  recommendation: string;
}

export interface StyleCalibration {
  confidence: "low" | "medium" | "high";
  approvedGoldenCount: number;
  representativeGoldenCount: number;
  diagnostics: StyleCalibrationDiagnostic[];
}

export function goldenContentHash(body: string): string {
  return createHash("sha256")
    .update(body.trim().replace(/\s+/gu, " ").toLocaleLowerCase())
    .digest("hex");
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
}

function tokens(values: string[]): Set<string> {
  return new Set(
    values.join(" ")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu)
      ?.filter((token) => ![
        "professional", "clear", "concise", "engaging", "friendly", "authentic",
        "helpful", "informative", "content", "audience", "brand",
      ].includes(token)) ?? [],
  );
}

export function calibrateStyleProfile(args: {
  profile: StyleAnalysisRecord | null;
  sources: StyleAnalysisSource[];
  goldens: ContentGoldenExample[];
  competitorVocabulary?: string[];
  otherApprovedProfiles?: StyleAnalysisRecord[];
}): StyleCalibration {
  const approvedGoldens = args.goldens.filter(
    (golden) => golden.status === "approved" && golden.evaluation_permission,
  );
  const representative = approvedGoldens.filter((golden) => golden.represents_brand_strongly);
  const diagnostics: StyleCalibrationDiagnostic[] = [];
  const sourceCharacters = args.sources.reduce((sum, source) => sum + source.character_count, 0);

  if (approvedGoldens.length < 5) {
    diagnostics.push({
      code: "insufficient_examples",
      severity: approvedGoldens.length < 3 ? "blocking" : "warning",
      message: `Only ${approvedGoldens.length} approved evaluation example${approvedGoldens.length === 1 ? "" : "s"} cover this channel.`,
      recommendation: "Approve at least five representative, permissioned examples from different content types.",
    });
  }
  if (args.sources.length < 5 || sourceCharacters < 2000) {
    diagnostics.push({
      code: "low_channel_confidence",
      severity: "warning",
      message: `The active analysis is based on ${args.sources.length} usable source${args.sources.length === 1 ? "" : "s"} and ${sourceCharacters.toLocaleString()} characters.`,
      recommendation: "Collect more recent company-owned examples before treating the profile as distinctive.",
    });
  }

  const profile = args.profile?.analysis;
  if (profile) {
    const distinctive = tokens([
      ...profile.voice_traits,
      ...profile.hook_patterns,
      ...profile.structure_patterns,
      ...profile.vocabulary_patterns,
      ...profile.cta_patterns,
    ]);
    if (distinctive.size < 8) {
      diagnostics.push({
        code: "too_generic",
        severity: "warning",
        message: "The approved profile contains too few distinctive, observable style markers.",
        recommendation: "Replace broad labels with concrete hook, sentence, vocabulary and CTA patterns tied to examples.",
      });
    }

    const restrictiveCount = profile.avoid_patterns.length +
      [...profile.summary.matchAll(/\b(always|never|must|only)\b/giu)].length;
    if (restrictiveCount > 10) {
      diagnostics.push({
        code: "too_restrictive",
        severity: "warning",
        message: "The profile contains many absolute or avoid instructions and may suppress natural variation.",
        recommendation: "Keep hard prohibitions in Company DNA and express style analysis as weighted patterns.",
      });
    }

    const preferred = normalizedSet(profile.vocabulary_patterns);
    const avoided = normalizedSet(profile.avoid_patterns);
    const overlap = [...preferred].filter((value) => avoided.has(value));
    if (overlap.length) {
      diagnostics.push({
        code: "contradictory",
        severity: "blocking",
        message: `The same pattern appears as both preferred and avoided: ${overlap.slice(0, 3).join(", ")}.`,
        recommendation: "Resolve the contradiction before approving a new profile version.",
      });
    }

    const profileTime = args.profile?.analysed_at ? Date.parse(args.profile.analysed_at) : 0;
    const newerCount = args.sources.filter((source) => Date.parse(source.created_at) > profileTime).length;
    if (profileTime && newerCount >= 3) {
      diagnostics.push({
        code: "outdated",
        severity: "warning",
        message: `${newerCount} newer owned examples are not represented in the active profile.`,
        recommendation: "Refresh the analysis and review the new version before replacing the current authority.",
      });
    }

    const competitorTokens = tokens(args.competitorVocabulary ?? []);
    const sharedCompetitorTokens = [...distinctive].filter((token) => competitorTokens.has(token));
    if (competitorTokens.size >= 8 && sharedCompetitorTokens.length / distinctive.size >= 0.45) {
      diagnostics.push({
        code: "competitor_similarity",
        severity: "warning",
        message: "A large share of the profile’s distinctive vocabulary also appears in competitor material.",
        recommendation: "Review the profile and retain only traits demonstrated by company-owned examples.",
      });
    }

    const types = new Map<string, number>();
    for (const golden of approvedGoldens) {
      const type = golden.content_type.toLocaleLowerCase();
      types.set(type, (types.get(type) ?? 0) + 1);
    }
    const largestType = Math.max(0, ...types.values());
    if (approvedGoldens.length >= 4 && largestType / approvedGoldens.length >= 0.75) {
      diagnostics.push({
        code: "promotional_skew",
        severity: "info",
        message: "The golden set is dominated by one content type, which may make the profile too narrow.",
        recommendation: "Add educational, founder-led, proof-oriented or editorial examples for balance.",
      });
    }

    const otherProfiles = args.otherApprovedProfiles ?? [];
    const thisTraits = normalizedSet(profile.voice_traits);
    const nearDuplicate = otherProfiles.find((other) => {
      const otherTraits = normalizedSet(other.analysis.voice_traits);
      if (!thisTraits.size || !otherTraits.size) return false;
      const overlapCount = [...thisTraits].filter((trait) => otherTraits.has(trait)).length;
      return overlapCount / Math.min(thisTraits.size, otherTraits.size) >= 0.8;
    });
    if (nearDuplicate) {
      diagnostics.push({
        code: "channel_inconsistency",
        severity: "info",
        message: `The ${args.profile?.channel} profile is almost identical to ${nearDuplicate.channel}, despite different channel conventions.`,
        recommendation: "Add channel-specific structural and audience-relationship guidance.",
      });
    }
  }

  const confidence =
    representative.length >= 6 && args.sources.length >= 8 && sourceCharacters >= 5000 &&
      !diagnostics.some((diagnostic) => diagnostic.severity === "blocking")
      ? "high"
      : representative.length >= 3 && args.sources.length >= 5 && sourceCharacters >= 2000
        ? "medium"
        : "low";

  return {
    confidence,
    approvedGoldenCount: approvedGoldens.length,
    representativeGoldenCount: representative.length,
    diagnostics,
  };
}

export interface BlindVoiceEvaluation {
  id: string;
  client_id: string;
  channel: StyleAnalysisChannel;
  status: "running" | "ready" | "reviewed" | "failed";
  brief: Record<string, unknown>;
  variant_a: string | null;
  variant_b: string | null;
  automated_evaluation: Record<string, unknown>;
  preferred_variant: "a" | "b" | "tie" | null;
  reviewer_notes: string | null;
  error?: string | null;
  revealed_winner?: "conditioned" | "baseline" | "tie" | null;
  revealed_assignment?: {
    variant_a: "conditioned" | "baseline" | null;
    variant_b: "conditioned" | "baseline" | null;
  };
  created_at: string;
  reviewed_at: string | null;
}

export interface DeterministicVoiceMetrics {
  vocabularyFit: number;
  structuralSimilarity: number;
  genericnessRisk: number;
  copyingRisk: number;
  longestCopiedPhraseWords: number;
  hardRulesPass: boolean;
  unsupportedClaimsPass: boolean;
  channelStructurePass: boolean;
  warnings: string[];
}

function words(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function paragraphs(value: string): number {
  return Math.max(1, value.trim().split(/\n\s*\n/gu).filter(Boolean).length);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function boundedSimilarity(actual: number, expected: number): number {
  if (!actual || !expected) return 0;
  return Math.round(Math.max(0, Math.min(1, Math.min(actual, expected) / Math.max(actual, expected))) * 100);
}

function ngrams(value: string, size: number): Set<string> {
  const tokens = words(value);
  const result = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

export function deterministicVoiceMetrics(args: {
  body: string;
  goldens: ContentGoldenExample[];
  competitorBodies?: string[];
  warnings?: string[];
}): DeterministicVoiceMetrics {
  const warnings = args.warnings ?? [];
  const preferences = args.goldens
    .flatMap((golden) => golden.vocabulary_preferences)
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  const normalizedBody = args.body.toLocaleLowerCase();
  const matchedPreferences = preferences.filter((value) => normalizedBody.includes(value));
  const vocabularyFit = preferences.length
    ? Math.round((new Set(matchedPreferences).size / new Set(preferences).size) * 100)
    : 50;

  const expectedWords = median(args.goldens.map((golden) => words(golden.body).length));
  const expectedParagraphs = median(args.goldens.map((golden) => paragraphs(golden.body)));
  const structuralSimilarity = Math.round((
    boundedSimilarity(words(args.body).length, expectedWords) +
    boundedSimilarity(paragraphs(args.body), expectedParagraphs)
  ) / 2);

  const genericPhrases = [
    "in today’s fast-paced world", "in today's fast-paced world", "game changer",
    "unlock your potential", "take it to the next level", "ever-evolving landscape",
    "now more than ever", "whether you’re", "whether you're", "look no further",
    "delve into", "revolutionize", "seamlessly", "it is important to note",
  ];
  const genericMatches = genericPhrases.filter((phrase) => normalizedBody.includes(phrase)).length;
  const genericnessRisk = Math.min(100, genericMatches * 25);

  const comparisonBodies = [
    ...args.goldens.map((golden) => golden.body),
    ...(args.competitorBodies ?? []),
  ];
  let longestCopiedPhraseWords = 0;
  for (let size = 20; size >= 6 && !longestCopiedPhraseWords; size -= 1) {
    const candidate = ngrams(args.body, size);
    if (!candidate.size) continue;
    const comparison = new Set(comparisonBodies.flatMap((body) => [...ngrams(body, size)]));
    if ([...candidate].some((phrase) => comparison.has(phrase))) longestCopiedPhraseWords = size;
  }
  const candidateSixGrams = ngrams(args.body, 6);
  const comparisonSixGrams = new Set(comparisonBodies.flatMap((body) => [...ngrams(body, 6)]));
  const copiedSixGrams = [...candidateSixGrams].filter((phrase) => comparisonSixGrams.has(phrase)).length;
  const copyingRisk = candidateSixGrams.size
    ? Math.round((copiedSixGrams / candidateSixGrams.size) * 100)
    : 0;

  const unsupportedClaimsPass = !warnings.some((warning) =>
    /unsupported|claim|evidence|source|fact/iu.test(warning));
  const channelStructurePass = !warnings.some((warning) =>
    /platform|structure|length|character|paragraph|heading|hashtag|subject|cta/iu.test(warning));

  return {
    vocabularyFit,
    structuralSimilarity,
    genericnessRisk,
    copyingRisk,
    longestCopiedPhraseWords,
    hardRulesPass: warnings.length === 0,
    unsupportedClaimsPass,
    channelStructurePass,
    warnings,
  };
}
