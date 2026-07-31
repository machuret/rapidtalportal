import { z } from "zod";

/**
 * Brain Context is the versioned contract every official AI surface consumes.
 * New fields remain backward-compatible so historical immutable snapshots can
 * still be inspected while current outputs use the latest resolver.
 */
export const BRAIN_CONTEXT_VERSION = "brain-context-v1" as const;
export const BRAIN_RESOLVER_VERSION = "resolver-v4-library-availability" as const;
export const BRAIN_RESOLVER_VERSIONS = [
  "resolver-v1",
  "resolver-v2-task-memory",
  "resolver-v3-business-library",
  BRAIN_RESOLVER_VERSION,
] as const;

export const BRAIN_CONTEXT_SURFACES = ["ask", "content", "compose", "tool", "diagnostic"] as const;
export const BRAIN_CONTEXT_CHANNELS = [
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "email",
  "blog",
  "newsletter",
  "message",
  "other",
] as const;

export const brainContextSurfaceSchema = z.enum(BRAIN_CONTEXT_SURFACES);
export const brainContextChannelSchema = z.enum(BRAIN_CONTEXT_CHANNELS);

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const nullableTimestamp = z.iso.datetime({ offset: true }).nullable();
const score = z.number().min(0).max(1);

export const brainContextRequestSchema = z.object({
  surface: brainContextSurfaceSchema,
  channel: brainContextChannelSchema.optional(),
  contentType: optionalText(120),
  topic: optionalText(2000),
  audience: optionalText(1000),
  objective: optionalText(2000),
  intent: optionalText(1000),
  selectedVaultSourceIds: z.array(z.uuid()).max(100).default([]),
  includeMarketIntelligence: z.boolean().default(false),
});

export const brainKnowledgeSourceSchema = z.object({
  itemId: z.uuid(),
  chunkId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(500),
  excerpt: z.string().trim().min(1).max(12000),
  category: z.string().trim().max(120).nullable(),
  sourceUrl: z.url().nullable(),
  selectionMethod: z.enum(["semantic", "full_text", "selected", "fallback"]),
  relevance: score.nullable(),
  selectionReason: z.string().trim().min(1).max(1000),
});

export const brainLibrarySourceSchema = z.object({
  entryId: z.uuid(),
  versionId: z.uuid(),
  chunkId: z.uuid().nullable(),
  versionNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
  excerpt: z.string().trim().min(1).max(12000),
  category: z.string().trim().min(1).max(120),
  sourceUrl: z.url().nullable(),
  tags: z.array(z.string().trim().min(1).max(100)).max(30),
  selectionMethod: z.enum(["full_text", "lexical_recovery"]),
  relevance: score.nullable(),
  selectionReason: z.string().trim().min(1).max(1000),
});

export const brainHardRuleSchema = z.object({
  id: z.string().trim().min(1).max(200),
  type: z.enum([
    "prohibit_phrase",
    "require_phrase",
    "require_prefix",
    "require_suffix",
    "min_words",
    "max_words",
    "max_emojis",
  ]),
  value: z.string().trim().min(1).max(300).optional(),
  limit: z.number().int().min(0).max(100000).optional(),
  channels: z.array(brainContextChannelSchema).max(12).default([]),
}).superRefine((rule, context) => {
  const numeric = ["min_words", "max_words", "max_emojis"].includes(rule.type);
  if (numeric && rule.limit === undefined) {
    context.addIssue({
      code: "custom",
      path: ["limit"],
      message: `${rule.type} requires a numeric limit.`,
    });
  }
  if (!numeric && !rule.value) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: `${rule.type} requires a value.`,
    });
  }
});

export const brainMemorySelectionSchema = z.object({
  memoryId: z.uuid(),
  kind: z.enum(["preference", "anti_pattern", "rule"]),
  content: z.string().trim().min(1).max(2000),
  confidence: z.number().int().min(0).max(100),
  pinned: z.boolean(),
  scope: z.object({
    // Legacy snapshots may have placed channels in the flat surfaces array.
    // The Phase 2 resolver always emits canonical fields, but old immutable
    // snapshots must remain readable.
    surfaces: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    channels: z.array(z.enum([
      "linkedin", "facebook", "instagram", "email", "blog", "newsletter",
    ])).max(6).optional(),
    contentTypes: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    audiences: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    objectives: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    global: z.boolean().optional(),
  }),
  relevance: score.nullable(),
  rankScore: score.nullable().optional(),
  selectionReason: z.string().trim().min(1).max(1000),
});

export const brainMarketInsightSchema = z.object({
  insightId: z.string().trim().min(1).max(200),
  kind: z.enum([
    "topic_cluster",
    "positioning_gap",
    "recurring_format",
    "competitor_comparison",
    "idea_recommendation",
  ]),
  summary: z.string().trim().min(1).max(4000),
  competitorIds: z.array(z.uuid()).max(30),
  sourceItemIds: z.array(z.uuid()).max(100),
  confidence: z.enum(["low", "medium", "high"]),
});

export const brainContextSchema = z.object({
  version: z.literal(BRAIN_CONTEXT_VERSION),
  clientId: z.uuid(),
  request: brainContextRequestSchema,
  company: z.object({
    fields: z.record(z.string(), z.string().trim().min(1).max(20000)),
    companyDnaUpdatedAt: nullableTimestamp,
  }),
  knowledge: z.object({
    sources: z.array(brainKnowledgeSourceSchema).max(100),
    retrievalQuery: z.string().trim().max(4000),
    retrievalMethod: z.string().trim().min(1).max(200),
    coverage: z.enum(["strong", "partial", "weak", "none"]),
  }),
  library: z.object({
    sources: z.array(brainLibrarySourceSchema).max(30),
    retrievalQuery: z.string().trim().max(4000),
    retrievalMethod: z.enum(["full_text", "lexical_recovery", "none"]),
    coverage: z.enum(["strong", "partial", "weak", "none"]),
    availability: z.enum(["available", "degraded", "unavailable", "not_requested"]).default("available"),
  }).default({
    sources: [],
    retrievalQuery: "",
    retrievalMethod: "none",
    coverage: "none",
    availability: "not_requested",
  }),
  style: z.object({
    source: z.enum([
      "project_snapshot",
      "approved_channel_analysis",
      "company_channel_style",
      "company_global_style",
      "generic_fallback",
    ]),
    profileId: z.uuid().nullable(),
    profileVersion: z.number().int().positive().nullable(),
    channel: brainContextChannelSchema.nullable(),
    confidence: z.number().int().min(0).max(100).nullable(),
    resolvedInstructions: z.array(z.string().trim().min(1).max(1000)).max(100),
    hardRules: z.array(brainHardRuleSchema).max(100),
    fallbackReason: z.string().trim().min(1).max(1000).optional(),
  }),
  memories: z.array(brainMemorySelectionSchema).max(100),
  market: z.object({
    included: z.boolean(),
    snapshotIds: z.array(z.uuid()).max(30),
    insights: z.array(brainMarketInsightSchema).max(100),
  }),
  warnings: z.array(z.object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(1000),
    severity: z.enum(["info", "warning", "blocking"]),
  })).max(100),
  provenance: z.object({
    resolverVersion: z.enum(BRAIN_RESOLVER_VERSIONS),
    generatedAt: z.iso.datetime({ offset: true }),
    model: z.string().trim().min(1).max(200).nullable(),
    promptVersion: z.string().trim().min(1).max(200).nullable(),
    companyDnaUpdatedAt: nullableTimestamp,
    styleProfileId: z.uuid().nullable(),
    styleProfileVersion: z.number().int().positive().nullable(),
    vaultItemIds: z.array(z.uuid()).max(100),
    vaultChunkIds: z.array(z.uuid()).max(200),
    libraryEntryIds: z.array(z.uuid()).max(30).default([]),
    libraryVersionIds: z.array(z.uuid()).max(30).default([]),
    libraryChunkIds: z.array(z.uuid()).max(60).default([]),
    memoryIds: z.array(z.uuid()).max(100),
    marketSnapshotIds: z.array(z.uuid()).max(30),
  }),
}).superRefine((context, refinement) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  const knowledgeItemIds = Array.from(
    new Set(context.knowledge.sources.map((source) => source.itemId)),
  );
  const knowledgeChunkIds = context.knowledge.sources.flatMap((source) =>
    source.chunkId ? [source.chunkId] : [],
  );
  const knowledgeSourceKeys = context.knowledge.sources.map((source) =>
    `${source.itemId}:${source.chunkId ?? "item"}`,
  );
  const libraryEntryIds = Array.from(
    new Set(context.library.sources.map((source) => source.entryId)),
  );
  const libraryVersionIds = Array.from(
    new Set(context.library.sources.map((source) => source.versionId)),
  );
  const libraryChunkIds = context.library.sources.flatMap((source) =>
    source.chunkId ? [source.chunkId] : [],
  );
  const librarySourceKeys = context.library.sources.map((source) =>
    `${source.versionId}:${source.chunkId ?? "version"}`,
  );
  const memoryIds = context.memories.map((memory) => memory.memoryId);

  if (!unique(context.request.selectedVaultSourceIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["request", "selectedVaultSourceIds"],
      message: "Selected Vault source IDs must be unique.",
    });
  }
  if (
    !unique(knowledgeSourceKeys) ||
    !unique(knowledgeChunkIds) ||
    !unique(librarySourceKeys) ||
    !unique(libraryChunkIds) ||
    !unique(memoryIds)
  ) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance"],
      message: "Resolved Brain context references must be unique.",
    });
  }
  if (!sameSet(context.provenance.vaultItemIds, knowledgeItemIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "vaultItemIds"],
      message: "Vault item provenance must match the selected knowledge sources.",
    });
  }
  if (!sameSet(context.provenance.vaultChunkIds, knowledgeChunkIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "vaultChunkIds"],
      message: "Vault chunk provenance must match the selected knowledge sources.",
    });
  }
  if (!sameSet(context.provenance.libraryEntryIds, libraryEntryIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "libraryEntryIds"],
      message: "Library entry provenance must match the selected guidance.",
    });
  }
  if (!sameSet(context.provenance.libraryVersionIds, libraryVersionIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "libraryVersionIds"],
      message: "Library version provenance must match the selected guidance.",
    });
  }
  if (!sameSet(context.provenance.libraryChunkIds, libraryChunkIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "libraryChunkIds"],
      message: "Library chunk provenance must match the selected guidance.",
    });
  }
  if (context.library.availability === "unavailable") {
    const visibleWarning = context.warnings.some((warning) =>
      warning.code === "business_library_unavailable" &&
      warning.severity === "warning"
    );
    if (!visibleWarning || context.library.sources.length > 0) {
      refinement.addIssue({
        code: "custom",
        path: ["library", "availability"],
        message: "Unavailable Library context must be empty and carry a visible recoverable warning.",
      });
    }
  }
  if (context.library.availability === "degraded") {
    const visibleWarning = context.warnings.some((warning) =>
      warning.code === "business_library_search_degraded"
    );
    if (!visibleWarning) {
      refinement.addIssue({
        code: "custom",
        path: ["library", "availability"],
        message: "Degraded Library context must carry a visible warning.",
      });
    }
  }
  if (!sameSet(context.provenance.memoryIds, memoryIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "memoryIds"],
      message: "Memory provenance must match the selected lessons.",
    });
  }
  if (!sameSet(context.provenance.marketSnapshotIds, context.market.snapshotIds)) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "marketSnapshotIds"],
      message: "Market provenance must match the selected intelligence snapshots.",
    });
  }
  if (!context.market.included && (context.market.snapshotIds.length || context.market.insights.length)) {
    refinement.addIssue({
      code: "custom",
      path: ["market"],
      message: "Excluded market intelligence cannot contain snapshots or insights.",
    });
  }
  if (context.market.included && !context.request.includeMarketIntelligence) {
    refinement.addIssue({
      code: "custom",
      path: ["market", "included"],
      message: "Market intelligence cannot be included unless the request allows it.",
    });
  }
  if (
    context.provenance.styleProfileId !== context.style.profileId ||
    context.provenance.styleProfileVersion !== context.style.profileVersion
  ) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "styleProfileId"],
      message: "Style provenance must match the resolved style profile.",
    });
  }
  if (context.provenance.companyDnaUpdatedAt !== context.company.companyDnaUpdatedAt) {
    refinement.addIssue({
      code: "custom",
      path: ["provenance", "companyDnaUpdatedAt"],
      message: "Company DNA provenance must match the resolved company context.",
    });
  }
});

export type BrainContext = z.infer<typeof brainContextSchema>;
export type BrainContextRequest = z.infer<typeof brainContextRequestSchema>;
export type BrainKnowledgeSource = z.infer<typeof brainKnowledgeSourceSchema>;
export type BrainLibrarySource = z.infer<typeof brainLibrarySourceSchema>;
export type BrainMemorySelection = z.infer<typeof brainMemorySelectionSchema>;

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

/**
 * Stable JSON is the input to the database SHA-256 snapshot hash. Keeping the
 * canonicalisation here makes hashes reproducible in Node, Edge and tests.
 */
export function stableBrainContextJson(value: BrainContext): string {
  return JSON.stringify(sortJson(brainContextSchema.parse(value)));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}
