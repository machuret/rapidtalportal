/**
 * Centralized content-related type definitions
 * Single source of truth for content domain types
 */

import { Mail, Share2, Newspaper, BookText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ContentType = "email" | "social" | "newsletter" | "blog";
export type TopicStatus = "pending" | "approved" | "rejected";
export type ContentStatus = "draft" | "approved" | "archived";

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
  status: ContentStatus;
  created_at: string;
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
}

/** What the Brain used to produce a suggestion (powers "Why this?"). */
export interface BrainWhy {
  profile?: boolean;
  vault?: boolean;
  lessons?: number;
  examples?: number;
  grounded?: boolean;
  fit?: number | null;
}

export interface ContentGenerationParams {
  clientId: string;
  userId: string;
  contentType: ContentType;
  title: string;
  brief: string;
  tone: string;
  length: "short" | "medium" | "long";
}

// Constants as const assertions for type safety
export const CONTENT_TYPES = [
  { id: "email" as const, label: "Email", desc: "Professional business email with CTA" },
  { id: "social" as const, label: "Social Media", desc: "LinkedIn, Facebook & Instagram variants" },
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
  social: "text-pink-400",
  newsletter: "text-amber-400",
  blog: "text-green-400",
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
  social: Share2,
  newsletter: Newspaper,
  blog: BookText,
};
