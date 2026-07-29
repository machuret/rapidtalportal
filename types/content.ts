/**
 * Centralized content-related type definitions
 * Single source of truth for content domain types
 */

import {
  Mail,
  Share2,
  Newspaper,
  BookText,
  BriefcaseBusiness,
  Users,
  Camera,
  MessageSquare,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ContentType =
  | "email"
  | "x"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "newsletter"
  | "blog"
  | "message"
  | "other"
  | "social"; // legacy combined-social rows remain readable
export type TopicStatus = "pending" | "approved" | "rejected";
export type ContentStatus = "draft" | "approved" | "archived";
export type ContentLength = "short" | "medium" | "long";
export type ContentTone =
  | "professional"
  | "friendly"
  | "persuasive"
  | "casual"
  | "authoritative"
  | "warm"
  | "direct"
  | "playful";

export interface ContentMarketIntelligenceSource {
  itemId: string;
  captureVersionId: string;
  contentHash: string;
  competitorId: string;
  competitorName: string;
  title: string;
  url: string;
  effectiveAt: string;
  dateBasis: "published" | "captured";
  evidenceQuote: string;
}

export interface ContentMarketIntelligenceCompanyReference {
  id: string;
  kind: "content_piece" | "vault_item";
  title: string;
  contentHash: string;
}

export interface ContentMarketIntelligenceProvenance {
  version: 1;
  runId: string;
  reportSchemaVersion: 2;
  ideaTitle: string;
  confidence: "low" | "medium" | "high";
  novelty: "new" | "adjacent" | "overlap";
  competitorIds: string[];
  competitorSources: ContentMarketIntelligenceSource[];
  companyReferences: ContentMarketIntelligenceCompanyReference[];
  generatedAt: string;
}

export interface ContentBrief {
  version: 1;
  objective: string;
  audience?: string | null;
  angle?: string | null;
  desiredFormat?: string | null;
  keyPoints?: string[];
  callToAction?: string | null;
  language?: string | null;
  tone: ContentTone;
  length: ContentLength;
  mode?: "new" | "reply";
  inboundContext?: string | null;
  additionalGuidance?: string | null;
  marketIntelligence?: ContentMarketIntelligenceProvenance | null;
  recipient?: {
    id?: string | null;
    name: string;
    company?: string | null;
  } | null;
}

export interface ContentSourceReference {
  itemId: string;
  title: string;
  kind: "semantic" | "vault_item";
  excerpt: string;
  similarity?: number | null;
}

export interface ContentTopic {
  id: string;
  title: string;
  description: string | null;
  content_type: ContentType;
  status: TopicStatus;
  created_at: string;
  created_by: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface ContentPiece {
  id: string;
  content_type: ContentType;
  title: string;
  body?: string | null;
  style_snapshot?: {
    channel?: string;
    summary?: string[];
    hardRules?: Array<Record<string, unknown>>;
    styleAnalysis?: {
      id: string;
      channel: string;
      summary: string;
      sourceItemIds: string[];
      analysedAt: string | null;
      approvedAt: string | null;
    } | null;
    exampleSources?: Array<{
      itemId: string;
      title: string;
      sourceUrl: string | null;
    }>;
    companyDnaUpdatedAt?: string | null;
    capturedAt?: string;
  } | null;
  content_brief?: ContentBrief | null;
  source_references?: ContentSourceReference[];
  project_id?: string | null;
  parent_piece_id?: string | null;
  generation_kind?: "original" | "reply" | "rewrite" | "duplicate" | "adaptation" | "manual";
  status: ContentStatus;
  created_at: string;
}

export type ContentProjectStep =
  | "idea"
  | "brief"
  | "evidence"
  | "generate"
  | "edit"
  | "validate"
  | "approve"
  | "complete";

export type ContentProjectStatus =
  | "active"
  | "saved"
  | "rejected"
  | "approved"
  | "archived";

export interface ContentProjectIdea {
  version: 1;
  origin: "company_topic" | "competitor_intelligence" | "manual";
  title: string;
  channel: ContentType;
  rationale: string;
  differentiation: string;
  evidenceSummary: string;
  topicId?: string | null;
  marketIntelligence?: ContentMarketIntelligenceProvenance | null;
}

export interface ContentProject {
  id: string;
  client_id: string;
  title: string;
  status: ContentProjectStatus;
  current_step: ContentProjectStep;
  idea_snapshot: ContentProjectIdea;
  content_brief: ContentBrief | Record<string, never>;
  vault_source_ids: string[];
  vault_source_references: ContentSourceReference[];
  competitor_signals: ContentMarketIntelligenceSource[];
  style_snapshot: ContentPiece["style_snapshot"] & {
    hardRules?: Array<Record<string, unknown>>;
  };
  current_piece_id: string | null;
  current_piece?: ContentPiece | null;
  created_at: string;
  updated_at: string;
}

export interface ContentEvidenceOption {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  sourceUrl: string | null;
}

export interface AiSuggestion {
  title: string;
  description: string;
  content_type: ContentType;
  rationale: string;
  /** Brain pre-screen: 0-100 fit to this company (null if not scored). */
  fit?: number | null;
  /** Brain flagged this as weak/off-brand (fit below threshold). */
  ai_flagged?: boolean;
  /** Provenance for "Why this?" — what the Brain drew on. */
  why?: BrainWhy | null;
  opportunity_type?: "gap" | "differentiation" | "counter_position" | "market_pattern" | null;
  evidence_summary?: string;
  competitor_evidence?: Array<{
    item_id: string;
    competitor_id: string;
    competitor_name: string;
    title: string;
    url: string;
  }>;
}

/** What the Brain used to produce a suggestion (powers "Why this?"). */
export interface BrainWhy {
  profile?: boolean;
  vault?: boolean;
  lessons?: number;
  examples?: number;
  grounded?: boolean;
  fit?: number | null;
  competitor_evidence?: number;
  competitors?: string[];
  competitor_sources?: AiSuggestion["competitor_evidence"];
  opportunity_type?: AiSuggestion["opportunity_type"];
  evidence_summary?: string;
}

export interface ContentGenerationParams {
  clientId: string;
  contentType: ContentType;
  title: string;
  brief: ContentBrief;
}

// Constants as const assertions for type safety
export const CONTENT_TYPES = [
  { id: "email" as const, label: "Email", desc: "Business email with a clear CTA" },
  { id: "x" as const, label: "X / Twitter", desc: "Concise post within the 280-character limit" },
  { id: "linkedin" as const, label: "LinkedIn", desc: "Professional post for one clear audience" },
  { id: "facebook" as const, label: "Facebook", desc: "Conversational community-focused post" },
  { id: "instagram" as const, label: "Instagram", desc: "Caption with visual direction and hashtags" },
  { id: "newsletter" as const, label: "Newsletter", desc: "Client newsletter with sections & CTA" },
  { id: "blog" as const, label: "Blog Post", desc: "SEO-friendly article with subheadings" },
];

export const TONES = [
  "Professional",
  "Friendly", 
  "Persuasive",
  "Casual",
  "Authoritative",
] as const;

export const LENGTHS = [
  { id: "short" as const, label: "Short" },
  { id: "medium" as const, label: "Medium" },
  { id: "long" as const, label: "Long" },
];

// Style constants with proper typing
export const TYPE_ICON_COLORS: Record<ContentType, string> = {
  email: "text-blue-400",
  x: "text-zinc-200",
  linkedin: "text-sky-400",
  facebook: "text-blue-500",
  instagram: "text-fuchsia-400",
  social: "text-pink-400",
  newsletter: "text-amber-400",
  blog: "text-green-400",
  message: "text-teal-400",
  other: "text-zinc-400",
};

export const STATUS_STYLES: Record<TopicStatus, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

export const CONTENT_STATUS_STYLES: Record<ContentStatus, string> = {
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  archived: "bg-zinc-700 text-zinc-500 border-zinc-600",
};

export const TYPE_ICONS: Record<ContentType, LucideIcon> = {
  email: Mail,
  x: Share2,
  linkedin: BriefcaseBusiness,
  facebook: Users,
  instagram: Camera,
  social: Share2,
  newsletter: Newspaper,
  blog: BookText,
  message: MessageSquare,
  other: FileText,
};
