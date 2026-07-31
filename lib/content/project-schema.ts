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
  runId: z.uuid(),
  reportSchemaVersion: z.literal(2),
  ideaTitle: z.string().trim().min(1).max(220),
  whyValuable: z.string().trim().min(1).max(2000),
  differentiation: z.string().trim().min(1).max(2000),
  confidence: z.enum(["low", "medium", "high"]),
  novelty: z.enum(["new", "adjacent", "overlap"]),
  competitorIds: z.array(z.uuid()).min(1).max(12),
  competitorSources: z.array(z.object({
    itemId: z.uuid(),
    captureVersionId: z.uuid(),
    contentHash: z.string().min(16).max(256),
    competitorId: z.uuid(),
    competitorName: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(500),
    url: z.url(),
    effectiveAt: z.iso.datetime({ offset: true }),
    dateBasis: z.enum(["published", "captured"]),
    evidenceQuote: z.string().trim().min(20).max(500),
  })).min(2).max(12),
  companyReferences: z.array(z.object({
    id: z.uuid(),
    kind: z.enum(["content_piece", "vault_item"]),
    title: z.string().trim().min(1).max(500),
    contentHash: z.string().min(16).max(256),
  })).max(12),
  generatedAt: z.iso.datetime({ offset: true }),
}).superRefine((value, context) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(value.competitorIds)) {
    context.addIssue({
      code: "custom",
      path: ["competitorIds"],
      message: "Competitor references must be unique.",
    });
  }
  if (!unique(value.competitorSources.map((source) => source.itemId))) {
    context.addIssue({
      code: "custom",
      path: ["competitorSources"],
      message: "Competitor source references must be unique.",
    });
  }
  if (!unique(value.companyReferences.map((source) => source.id))) {
    context.addIssue({
      code: "custom",
      path: ["companyReferences"],
      message: "Company references must be unique.",
    });
  }
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
    id: z.uuid().optional().nullable(),
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
  topicId: z.uuid().optional().nullable(),
  brainContextSnapshotId: z.uuid().optional().nullable(),
  marketIntelligence: contentMarketIntelligenceSchema.optional().nullable(),
  explainability: z.object({
    hook: z.string().trim().min(1).max(1000),
    topic: z.string().trim().min(1).max(500),
    intendedAudience: z.string().trim().min(1).max(1000),
    strategicObjective: z.string().trim().min(1).max(1000),
    whyValuable: z.string().trim().min(1).max(2000),
    companyDnaFit: z.string().trim().min(1).max(2000),
    supportingVaultMaterial: z.array(z.object({
      itemId: z.uuid(),
      title: z.string().trim().min(1).max(500),
    })).max(20),
    supportingMarketSignals: z.array(z.object({
      itemId: z.uuid(),
      competitorName: z.string().trim().min(1).max(300),
      title: z.string().trim().min(1).max(500),
      url: z.url(),
    })).max(20),
    differenceFromCompetitors: z.string().trim().min(1).max(2000),
    existingCompanyContent: z.array(z.object({
      id: z.uuid(),
      title: z.string().trim().min(1).max(500),
      contentType: z.string().trim().min(1).max(100),
    })).max(20),
    differenceFromExisting: z.string().trim().min(1).max(2000),
    recommendedFormat: z.string().trim().min(1).max(1000),
    recommendedCta: z.string().trim().min(1).max(1000),
    confidence: z.enum(["low", "medium", "high"]),
    evidenceStrength: z.enum(["low", "medium", "high"]),
    scores: z.object({
      companyRelevance: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
      audienceRelevance: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
      vaultEvidenceStrength: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
      marketOpportunity: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
      differentiation: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
      novelty: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
      channelFit: z.object({ score: z.number().int().min(0).max(100), explanation: z.string().trim().min(1).max(1000) }),
    }),
  }).optional().nullable(),
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
