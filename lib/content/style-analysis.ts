import { z } from "zod";
import type { StyleCalibration } from "@/lib/content/voice-calibration";

export const STYLE_ANALYSIS_CHANNELS = [
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "email",
  "blog",
  "newsletter",
] as const;
export const STYLE_SOURCES_UPDATED_EVENT = "rapidtal:style-sources-updated";
export const VOICE_GOLDENS_UPDATED_EVENT = "rapidtal:voice-goldens-updated";
export const COMPANY_VOICE_UPDATED_EVENT = "rapidtal:company-voice-updated";

export type StyleAnalysisChannel = typeof STYLE_ANALYSIS_CHANNELS[number];
export type StyleAnalysisStatus = "draft" | "approved" | "archived";

export interface StyleAnalysisSourceEvidence {
  itemId: string;
  title: string;
  sourceUrl: string | null;
  contentHash: string;
  capturedAt: string;
}

const shortText = z.string().trim().max(1200);
const patternList = z.array(z.string().trim().min(1).max(300)).max(10);

export const styleAnalysisProfileSchema = z.object({
  schema_version: z.literal(1),
  summary: shortText,
  voice_traits: patternList,
  tone: shortText,
  audience_relationship: shortText,
  hook_patterns: patternList,
  structure_patterns: patternList,
  sentence_style: shortText,
  paragraph_style: shortText,
  formatting_patterns: patternList,
  vocabulary_patterns: patternList,
  cta_patterns: patternList,
  emoji_usage: shortText,
  hashtag_usage: shortText,
  content_patterns: patternList,
  avoid_patterns: patternList,
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.object({
    source_item_id: z.string().uuid(),
    observations: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
  })).min(2).max(20),
});

export type StyleAnalysisProfile = z.infer<typeof styleAnalysisProfileSchema>;

export interface StyleAnalysisRecord {
  id: string;
  client_id: string;
  channel: StyleAnalysisChannel;
  status: StyleAnalysisStatus;
  analysis: StyleAnalysisProfile;
  source_item_ids: string[];
  source_evidence: StyleAnalysisSourceEvidence[];
  source_count: number;
  source_character_count: number;
  model: string | null;
  analysed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleAnalysisSource {
  id: string;
  title: string;
  source_url: string | null;
  status: string;
  channels: StyleAnalysisChannel[];
  character_count: number;
  created_at: string;
}

export interface StyleAnalysisChannelState {
  approved: StyleAnalysisRecord | null;
  draft: StyleAnalysisRecord | null;
  sources: StyleAnalysisSource[];
  calibration: StyleCalibration;
}

export interface StyleAnalysisResponse {
  channels: Record<StyleAnalysisChannel, StyleAnalysisChannelState>;
}

export const emptyStyleAnalysisProfile = (): StyleAnalysisProfile => ({
  schema_version: 1,
  summary: "",
  voice_traits: [],
  tone: "",
  audience_relationship: "",
  hook_patterns: [],
  structure_patterns: [],
  sentence_style: "",
  paragraph_style: "",
  formatting_patterns: [],
  vocabulary_patterns: [],
  cta_patterns: [],
  emoji_usage: "",
  hashtag_usage: "",
  content_patterns: [],
  avoid_patterns: [],
  confidence: "low",
  evidence: [],
});

export function parseStyleAnalysisProfile(value: unknown): StyleAnalysisProfile | null {
  const parsed = styleAnalysisProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
