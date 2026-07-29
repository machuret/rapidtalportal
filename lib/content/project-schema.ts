import { z } from "zod";

export const contentTypeSchema = z.enum([
  "email",
  "x",
  "linkedin",
  "facebook",
  "instagram",
  "newsletter",
  "blog",
  "message",
  "other",
]);

export const contentMarketIntelligenceSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  reportSchemaVersion: z.literal(2),
  ideaTitle: z.string().trim().min(1).max(220),
  confidence: z.enum(["low", "medium", "high"]),
  novelty: z.enum(["new", "adjacent", "overlap"]),
  competitorIds: z.array(z.string().uuid()).min(1).max(12),
  competitorSources: z.array(z.object({
    itemId: z.string().uuid(),
    captureVersionId: z.string().uuid(),
    contentHash: z.string().min(16).max(256),
    competitorId: z.string().uuid(),
    competitorName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    url: z.string().url(),
    effectiveAt: z.string().datetime({ offset: true }),
    dateBasis: z.enum(["published", "captured"]),
    evidenceQuote: z.string().trim().min(20).max(500),
  })).min(2).max(12),
  companyReferences: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(["content_piece", "vault_item"]),
    title: z.string().trim().min(1).max(500),
    contentHash: z.string().min(16).max(256),
  })).max(12),
  generatedAt: z.string().datetime({ offset: true }),
});

export const contentBriefSchema = z.object({
  version: z.literal(1).default(1),
  objective: z.string().trim().min(3).max(4000),
  audience: z.string().trim().max(1000).optional().nullable(),
  angle: z.string().trim().max(1500).optional().nullable(),
  desiredFormat: z.string().trim().max(500).optional().nullable(),
  keyPoints: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  callToAction: z.string().trim().max(1000).optional().nullable(),
  language: z.string().trim().max(100).optional().nullable(),
  tone: z.enum([
    "professional",
    "friendly",
    "persuasive",
    "casual",
    "authoritative",
    "warm",
    "direct",
    "playful",
  ]),
  length: z.enum(["short", "medium", "long"]),
  mode: z.enum(["new", "reply"]).optional(),
  inboundContext: z.string().trim().max(8000).optional().nullable(),
  additionalGuidance: z.string().trim().max(2000).optional().nullable(),
  marketIntelligence: contentMarketIntelligenceSchema.optional().nullable(),
  recipient: z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1).max(200),
    company: z.string().trim().max(200).optional().nullable(),
  }).optional().nullable(),
});

export const contentProjectIdeaSchema = z.object({
  version: z.literal(1),
  origin: z.enum(["company_topic", "competitor_intelligence", "manual"]),
  title: z.string().trim().min(1).max(300),
  channel: contentTypeSchema,
  rationale: z.string().trim().max(2000).default(""),
  differentiation: z.string().trim().max(2000).default(""),
  evidenceSummary: z.string().trim().max(2000).default(""),
  topicId: z.string().uuid().optional().nullable(),
  marketIntelligence: contentMarketIntelligenceSchema.optional().nullable(),
});

export const contentProjectStepSchema = z.enum([
  "idea",
  "brief",
  "evidence",
  "generate",
  "edit",
  "validate",
  "approve",
  "complete",
]);

export const contentProjectStatusSchema = z.enum([
  "active",
  "saved",
  "rejected",
  "approved",
  "archived",
]);
