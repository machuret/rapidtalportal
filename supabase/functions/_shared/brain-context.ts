import {
  normalizeBrainMemoryScope,
  brainMemoryScopeMatches,
  brainMemoryScopeSpecificity,
  type BrainMemoryScope,
} from "./brain-memory-scope.ts";
import {
  resolveContentStyle,
  type ContentHardRule,
  type ContentStyleSnapshot,
} from "./content-style.ts";

export const BRAIN_CONTEXT_VERSION = "brain-context-v1" as const;
export const BRAIN_RESOLVER_VERSION = "resolver-v4-library-availability" as const;

export type BrainSurface = "ask" | "content" | "compose" | "tool" | "diagnostic";
export type BrainChannel =
  | "linkedin"
  | "facebook"
  | "instagram"
  | "x"
  | "email"
  | "blog"
  | "newsletter"
  | "message"
  | "other";

export interface BrainContextRequest {
  surface: BrainSurface;
  channel?: BrainChannel;
  contentType?: string;
  topic?: string;
  audience?: string;
  objective?: string;
  intent?: string;
  selectedVaultSourceIds: string[];
  includeMarketIntelligence: boolean;
}

export interface BrainKnowledgeSource {
  itemId: string;
  chunkId: string | null;
  title: string;
  excerpt: string;
  category: string | null;
  sourceUrl: string | null;
  selectionMethod: "semantic" | "full_text" | "selected" | "fallback";
  relevance: number | null;
  selectionReason: string;
}

export interface BrainLibrarySource {
  entryId: string;
  versionId: string;
  chunkId: string | null;
  versionNumber: number;
  title: string;
  excerpt: string;
  category: string;
  sourceUrl: string | null;
  tags: string[];
  selectionMethod: "full_text" | "lexical_recovery";
  relevance: number | null;
  selectionReason: string;
}

export interface BrainContextV1 {
  version: typeof BRAIN_CONTEXT_VERSION;
  clientId: string;
  request: BrainContextRequest;
  company: {
    fields: Record<string, string>;
    companyDnaUpdatedAt: string | null;
  };
  knowledge: {
    sources: BrainKnowledgeSource[];
    retrievalQuery: string;
    retrievalMethod: string;
    coverage: "strong" | "partial" | "weak" | "none";
  };
  library: {
    sources: BrainLibrarySource[];
    retrievalQuery: string;
    retrievalMethod: "full_text" | "lexical_recovery" | "none";
    coverage: "strong" | "partial" | "weak" | "none";
    availability: "available" | "degraded" | "unavailable" | "not_requested";
  };
  style: {
    source:
      | "project_snapshot"
      | "approved_channel_analysis"
      | "company_channel_style"
      | "company_global_style"
      | "generic_fallback";
    profileId: string | null;
    profileVersion: number | null;
    channel: BrainChannel | null;
    confidence: number | null;
    resolvedInstructions: string[];
    hardRules: ContentHardRule[];
    fallbackReason?: string;
  };
  memories: Array<{
    memoryId: string;
    kind: "preference" | "anti_pattern" | "rule";
    content: string;
    confidence: number;
    pinned: boolean;
    scope: BrainMemoryScope;
    relevance: number | null;
    rankScore: number | null;
    selectionReason: string;
  }>;
  market: {
    included: boolean;
    snapshotIds: string[];
    insights: Array<{
      insightId: string;
      kind:
        | "topic_cluster"
        | "positioning_gap"
        | "recurring_format"
        | "competitor_comparison"
        | "idea_recommendation";
      summary: string;
      competitorIds: string[];
      sourceItemIds: string[];
      confidence: "low" | "medium" | "high";
    }>;
  };
  warnings: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "blocking";
  }>;
  provenance: {
    resolverVersion: typeof BRAIN_RESOLVER_VERSION;
    generatedAt: string;
    model: string | null;
    promptVersion: string | null;
    companyDnaUpdatedAt: string | null;
    styleProfileId: string | null;
    styleProfileVersion: number | null;
    vaultItemIds: string[];
    vaultChunkIds: string[];
    libraryEntryIds: string[];
    libraryVersionIds: string[];
    libraryChunkIds: string[];
    memoryIds: string[];
    marketSnapshotIds: string[];
  };
}

interface VaultItemRow {
  id: string;
  title: string;
  raw_content: string | null;
  ai_summary: string | null;
  category: string | null;
  source_url: string | null;
  updated_at: string | null;
}

interface ChunkRow {
  id: string;
  item_id: string;
  content: string;
  similarity: number;
}

interface LibrarySearchRow {
  entry_id: string;
  version_id: string;
  chunk_id: string;
  version_number: number;
  title: string;
  summary: string;
  content: string;
  category: string;
  source_url: string | null;
  tags: string[] | null;
  rank: number | null;
}

interface LibraryVersionRow {
  id: string;
  entry_id: string;
  version_number: number;
  category_id: string;
  title: string;
  summary: string;
  body: string;
  source_url: string | null;
  tags: string[] | null;
}

interface MemoryRow {
  id: string;
  kind: "preference" | "anti_pattern" | "rule";
  content: string;
  confidence: number;
  pinned: boolean;
  scope: BrainMemoryScope | null;
  semantic_relevance?: number | null;
  scope_specificity?: number | null;
  rank_score?: number | null;
  selection_reason?: string | null;
}

interface MemoryConflictRow {
  id: string;
  content: string;
  conflict_summary: string | null;
}

const COMPANY_FIELDS = [
  "company_name",
  "company_description",
  "founders",
  "location",
  "address",
  "phone",
  "email",
  "website",
  "values",
  "services",
  "target_demographic",
  "client_type",
  "business_goals",
  "marketing_goals",
  "team",
  "tools_used",
  "content_style",
  "brand_voice",
  "internal_rules",
  "sign_off",
  "preferred_terms",
  "prohibited_terms",
  "emoji_policy",
  "humour_policy",
  "spelling_locale",
  "default_cta_style",
  "approved_claims",
  "prohibited_claims",
] as const;

const DNA_SELECT = [
  ...COMPANY_FIELDS,
  "channel_styles",
  "hard_rules",
  "extra",
  "updated_at",
].join(",");

const CHANNELS = new Set<BrainChannel>([
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "email",
  "blog",
  "newsletter",
  "message",
  "other",
]);

function compact(value: unknown, max = 20_000): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, max);
  return "";
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function safeTitle(value: string): string {
  return value.trim().slice(0, 500) || "Untitled Vault item";
}

function safeHardRules(rules: ContentHardRule[]): ContentHardRule[] {
  return rules.slice(0, 100).map((rule) => ({
    ...rule,
    channels: (rule.channels ?? [])
      .filter((channel): channel is BrainChannel => CHANNELS.has(channel as BrainChannel))
      .slice(0, 12),
  }));
}

function queryText(request: BrainContextRequest): string {
  return [
    request.topic,
    request.objective,
    request.audience,
    request.intent,
    request.contentType,
  ].filter(Boolean).join(". ").trim().slice(0, 4_000);
}

function queryTerms(query: string): string[] {
  return unique(
    query
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu) ?? [],
  ).filter((term) => ![
    "about", "after", "before", "from", "into", "that", "their", "these",
    "this", "those", "with", "write", "create", "content",
  ].includes(term)).slice(0, 40);
}

function lexicalScore(item: VaultItemRow, terms: string[]): number {
  if (!terms.length) return 0;
  const haystack = `${item.title}\n${item.ai_summary ?? ""}\n${item.raw_content ?? ""}`
    .toLocaleLowerCase();
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return Math.min(1, matched / Math.max(2, Math.min(terms.length, 8)));
}

function coverageFor(
  sources: Array<{ excerpt: string }>,
): "strong" | "partial" | "weak" | "none" {
  if (!sources.length) return "none";
  const chars = sources.reduce((sum, source) => sum + source.excerpt.length, 0);
  if (sources.length >= 4 && chars >= 2_500) return "strong";
  if (sources.length >= 2 && chars >= 900) return "partial";
  return "weak";
}

function libraryExcerpt(text: string, terms: string[], max = 4_000): string {
  const compacted = compact(text, 100_000);
  if (compacted.length <= max) return compacted;
  const lower = compacted.toLocaleLowerCase();
  const firstMatch = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (firstMatch === undefined) return compacted.slice(0, max);
  const start = Math.max(0, firstMatch - 500);
  return compacted.slice(start, start + max);
}

async function retrieveBusinessLibrary(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  query: string;
  channel?: BrainChannel;
  audience?: string;
  maxSources: number;
  today: string;
  now: string;
}): Promise<{
  sources: BrainLibrarySource[];
  method: BrainContextV1["library"]["retrievalMethod"];
  availability: BrainContextV1["library"]["availability"];
  warnings: BrainContextV1["warnings"];
}> {
  if (!args.query.trim()) {
    return { sources: [], method: "none", availability: "not_requested", warnings: [] };
  }

  try {
    const { data, error } = await args.admin.rpc("match_business_library_chunks", {
      p_query: args.query.slice(0, 4_000),
      p_match_count: args.maxSources,
      p_channel: args.channel ?? null,
      p_audience: args.audience ?? null,
    });
    if (error) throw error;
    const rows = (data ?? []) as LibrarySearchRow[];
    return {
      method: "full_text",
      availability: "available",
      warnings: [],
      sources: rows.slice(0, args.maxSources).map((row) => ({
        entryId: row.entry_id,
        versionId: row.version_id,
        chunkId: row.chunk_id,
        versionNumber: row.version_number,
        title: safeTitle(row.title),
        excerpt: compact(row.content, 4_000),
        category: compact(row.category, 120) || "General",
        sourceUrl: safeUrl(row.source_url),
        tags: unique((row.tags ?? []).map((tag) => compact(tag, 100)).filter(Boolean)).slice(0, 30),
        selectionMethod: "full_text" as const,
        relevance: typeof row.rank === "number"
          ? Math.max(0, Math.min(1, row.rank))
          : null,
        selectionReason: "Published Business Library guidance matched the current task.",
      })).filter((source) => source.excerpt.length > 0),
    };
  } catch (primaryError) {
    console.warn("brain-context: Business Library full-text retrieval unavailable", primaryError);
  }

  try {
    const versionsResult = await args.admin
      .from("business_library_versions")
      .select("id,entry_id,version_number,category_id,title,summary,body,source_url,tags")
      .eq("status", "published")
      .or(`valid_from.is.null,valid_from.lte.${args.today}`)
      .or(`valid_until.is.null,valid_until.gte.${args.today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${args.now}`)
      .order("published_at", { ascending: false })
      .limit(100);
    if (versionsResult.error) throw versionsResult.error;
    const versions = (versionsResult.data ?? []) as LibraryVersionRow[];
    const entryIds = unique(versions.map((version) => version.entry_id));
    const categoryIds = unique(versions.map((version) => version.category_id));
    const [entriesResult, categoriesResult] = await Promise.all([
      entryIds.length
        ? args.admin
          .from("business_library_entries")
          .select("id,current_version_id")
          .in("id", entryIds)
          .is("retired_at", null)
        : Promise.resolve({ data: [], error: null }),
      categoryIds.length
        ? args.admin
          .from("business_library_categories")
          .select("id,name")
          .in("id", categoryIds)
          .eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (entriesResult.error) throw entriesResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    const currentVersionByEntry = new Map(
      ((entriesResult.data ?? []) as Array<{ id: string; current_version_id: string }>)
        .map((entry) => [entry.id, entry.current_version_id]),
    );
    const categoryById = new Map(
      ((categoriesResult.data ?? []) as Array<{ id: string; name: string }>)
        .map((category) => [category.id, category.name]),
    );
    const terms = queryTerms(args.query);
    const sources = versions
      .filter((version) =>
        currentVersionByEntry.get(version.entry_id) === version.id &&
        categoryById.has(version.category_id)
      )
      .map((version) => {
        const text = `${version.title}\n${version.summary}\n${version.body}`;
        const score = lexicalScore({
          id: version.id,
          title: version.title,
          raw_content: version.body,
          ai_summary: version.summary,
          category: categoryById.get(version.category_id) ?? "General",
          source_url: version.source_url,
          updated_at: null,
        }, terms);
        return { version, text, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) =>
        right.score - left.score ||
        left.version.id.localeCompare(right.version.id))
      .slice(0, args.maxSources)
      .map(({ version, text, score }) => ({
        entryId: version.entry_id,
        versionId: version.id,
        chunkId: null,
        versionNumber: version.version_number,
        title: safeTitle(version.title),
        excerpt: libraryExcerpt(text, terms),
        category: categoryById.get(version.category_id) ?? "General",
        sourceUrl: safeUrl(version.source_url),
        tags: unique((version.tags ?? []).map((tag) => compact(tag, 100)).filter(Boolean)).slice(0, 30),
        selectionMethod: "lexical_recovery" as const,
        relevance: score,
        selectionReason: "Recovered through verified published-release matching after primary Library search was unavailable.",
      }));
    return {
      sources,
      method: "lexical_recovery",
      availability: "degraded",
      warnings: [{
        code: "business_library_search_degraded",
        message: "Business Library search recovered through its published-release fallback.",
        severity: "warning",
      }],
    };
  } catch (recoveryError) {
    console.warn("brain-context: Business Library recovery unavailable", recoveryError);
    return {
      sources: [],
      method: "none",
      availability: "unavailable",
      warnings: [{
        code: "business_library_unavailable",
        message: "Library temporarily unavailable. This answer used a verified snapshot of the remaining company context and can be retried.",
        severity: "warning",
      }],
    };
  }
}

/**
 * Strict memory budget. Hard rules bypass ranking; ordinary memory is kept
 * deliberately small so generic lessons cannot crowd out the current task.
 */
export function selectBrainMemoryBudget(rows: MemoryRow[]): MemoryRow[] {
  const rules = rows.filter((memory) => memory.kind === "rule").slice(0, 100);
  const pinnedPreferences = rows
    .filter((memory) => memory.kind === "preference" && memory.pinned)
    .slice(0, 2);
  const pinnedIds = new Set(pinnedPreferences.map((memory) => memory.id));
  const preferences = rows
    .filter((memory) =>
      memory.kind === "preference" &&
      !pinnedIds.has(memory.id) &&
      !memory.pinned
    )
    .slice(0, 3);
  const antiPatterns = rows
    .filter((memory) => memory.kind === "anti_pattern")
    .slice(0, 3);
  return [...rules, ...pinnedPreferences, ...preferences, ...antiPatterns];
}

function styleConfidence(analysis: Record<string, unknown> | null): number | null {
  const raw = analysis?.confidence;
  if (typeof raw === "number") return Math.max(0, Math.min(100, Math.round(raw)));
  if (raw === "high") return 85;
  if (raw === "medium") return 60;
  if (raw === "low") return 30;
  return null;
}

function styleVersion(row: Record<string, unknown> | null): number | null {
  const version = row?.version;
  return typeof version === "number" && Number.isInteger(version) && version > 0
    ? version
    : row ? 1 : null;
}

function insightRows(
  runId: string,
  analysis: Record<string, unknown>,
): BrainContextV1["market"]["insights"] {
  type InsightKind = BrainContextV1["market"]["insights"][number]["kind"];
  const configs: Array<{
    key: string;
    kind: InsightKind;
    summary: (row: Record<string, unknown>) => string;
  }> = [
    {
      key: "topic_clusters",
      kind: "topic_cluster",
      summary: (row) => [compact(row.label, 300), compact(row.description, 1_200)]
        .filter(Boolean).join(": "),
    },
    {
      key: "format_patterns",
      kind: "recurring_format",
      summary: (row) => [compact(row.name, 300), compact(row.description, 1_200)]
        .filter(Boolean).join(": "),
    },
    {
      key: "comparisons",
      kind: "competitor_comparison",
      summary: (row) => [compact(row.dimension, 300), compact(row.opportunity, 1_200)]
        .filter(Boolean).join(": "),
    },
    {
      key: "positioning_gaps",
      kind: "positioning_gap",
      summary: (row) => [compact(row.title, 300), compact(row.description, 1_200)]
        .filter(Boolean).join(": "),
    },
    {
      key: "recommended_ideas",
      kind: "idea_recommendation",
      summary: (row) => [compact(row.title, 300), compact(row.why_valuable, 1_200)]
        .filter(Boolean).join(": "),
    },
  ];
  const result: BrainContextV1["market"]["insights"] = [];
  for (const config of configs) {
    const rows = Array.isArray(analysis[config.key]) ? analysis[config.key] as unknown[] : [];
    for (let index = 0; index < rows.length && result.length < 30; index++) {
      const raw = rows[index];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as Record<string, unknown>;
      const summary = config.summary(row).trim().slice(0, 4_000);
      if (!summary) continue;
      const competitorIds = Array.isArray(row.competitor_ids)
        ? row.competitor_ids.filter((id): id is string => typeof id === "string")
        : [];
      const sourceItemIds = Array.isArray(row.source_item_ids)
        ? row.source_item_ids.filter((id): id is string => typeof id === "string")
        : [];
      const explicitConfidence = row.confidence;
      const confidence =
        explicitConfidence === "high" || explicitConfidence === "medium" || explicitConfidence === "low"
          ? explicitConfidence
          : row.signal_strength === "established" || row.company_fit === "high"
            ? "high"
            : row.signal_strength === "emerging" || row.company_fit === "medium"
              ? "medium"
              : "low";
      result.push({
        insightId: `${runId}:${config.key}:${index}`,
        kind: config.kind,
        summary,
        competitorIds: unique(competitorIds).slice(0, 30),
        sourceItemIds: unique(sourceItemIds).slice(0, 100),
        confidence,
      });
    }
  }
  return result;
}

function styleFromFrozenSnapshot(
  snapshot: ContentStyleSnapshot,
  channel: BrainChannel | null,
): BrainContextV1["style"] {
  return {
    source: "project_snapshot",
    profileId: snapshot.styleAnalysis?.id ?? null,
    profileVersion: snapshot.styleAnalysis ? 1 : null,
    channel,
    confidence: null,
    resolvedInstructions: snapshot.summary.map((entry) => entry.slice(0, 1_000)).slice(0, 100),
    hardRules: safeHardRules(snapshot.hardRules),
  };
}

export async function resolveBrainContext(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  clientId: string;
  request: BrainContextRequest;
  model?: string | null;
  promptVersion?: string | null;
  createdAt?: string;
  frozenStyleSnapshot?: ContentStyleSnapshot | null;
  requestedTone?: string;
  lengthHint?: string;
  maxKnowledge?: number;
  maxLibrary?: number;
  maxMemory?: number;
  /** Treat selectedVaultSourceIds as the complete allowed set, including []. */
  restrictToSelectedSources?: boolean;
  embed?: (query: string) => Promise<number[]>;
  /** OpenAI text-embedding-3-small (1536 dimensions), matching brain_memory. */
  memoryEmbed?: (query: string) => Promise<number[]>;
}): Promise<BrainContextV1> {
  const {
    admin,
    clientId,
    request,
    frozenStyleSnapshot = null,
    requestedTone = "",
    lengthHint = "",
  } = args;
  const generatedAt = args.createdAt ?? new Date().toISOString();
  const today = generatedAt.slice(0, 10);
  const maxKnowledge = Math.max(1, Math.min(args.maxKnowledge ?? 20, 100));
  const maxLibrary = Math.max(0, Math.min(args.maxLibrary ?? 8, 30));
  const maxMemory = Math.max(0, Math.min(args.maxMemory ?? 30, 100));
  const retrievalQuery = queryText(request);
  const selectedIds = unique(request.selectedVaultSourceIds);
  const explicitSelection = args.restrictToSelectedSources === true || selectedIds.length > 0;
  const warnings: BrainContextV1["warnings"] = [];

  const dnaPromise = admin
    .from("company_dna")
    .select(DNA_SELECT)
    .eq("client_id", clientId)
    .maybeSingle();
  const stylePromise = request.channel
    ? admin
      .from("content_style_analyses")
      .select("id,channel,analysis,source_item_ids,source_evidence,analysed_at,approved_at,version")
      .eq("client_id", clientId)
      .eq("channel", request.channel)
      .eq("status", "approved")
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  let vaultQuery;
  if (explicitSelection && selectedIds.length === 0) {
    vaultQuery = Promise.resolve({ data: [], error: null });
  } else {
    vaultQuery = admin
      .from("vault_items")
      .select("id,title,raw_content,ai_summary,category,source_url,updated_at")
      .eq("client_id", clientId)
      .eq("status", "ready")
      .eq("evidence_role", "factual")
      .eq("knowledge_status", "active")
      .eq("has_conflict", false)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${today}`);
    vaultQuery = selectedIds.length
      ? vaultQuery.in("id", selectedIds)
      : vaultQuery.order("updated_at", { ascending: false }).limit(100);
  }
  const memoryPromise = (async () => {
    if (maxMemory === 0) return { data: [], error: null };
    if (args.memoryEmbed && retrievalQuery) {
      try {
        const queryEmbedding = await args.memoryEmbed(retrievalQuery.slice(0, 2_000));
        const result = await admin.rpc("match_brain_memories", {
          p_client_id: clientId,
          p_query_embedding: queryEmbedding,
          p_surface: request.surface,
          p_channel: request.channel ?? null,
          p_content_type: request.contentType ?? null,
          p_limit: 12,
          p_audience: request.audience ?? null,
          p_objective: request.objective ?? null,
        });
        if (!result.error) return result;
        if (!/match_brain_memories|does not exist|schema cache/i.test(result.error.message ?? "")) {
          return result;
        }
      } catch (error) {
        console.warn("brain-context: semantic memory retrieval unavailable", error);
      }
    }
    return admin
      .from("brain_memory")
      .select("id,kind,content,confidence,pinned,scope")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("pinned", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(100);
  })();
  const memoryConflictPromise = (async () => {
    try {
      const result = await admin
        .from("brain_memory")
        .select("id,content,conflict_summary")
        .eq("client_id", clientId)
        .eq("contradiction_status", "open")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (result.error && /contradiction_status|schema cache/i.test(result.error.message ?? "")) {
        return { data: [], error: null };
      }
      return result;
    } catch {
      return { data: [], error: null };
    }
  })();
  const marketPromise = request.includeMarketIntelligence
    ? admin
      .from("competitor_intelligence_runs")
      .select("id,analysis")
      .eq("client_id", clientId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const libraryPromise = maxLibrary > 0
    ? retrieveBusinessLibrary({
      admin,
      query: retrievalQuery,
      channel: request.channel,
      audience: request.audience,
      maxSources: maxLibrary,
      today,
      now: generatedAt,
    })
    : Promise.resolve({
      sources: [] as BrainLibrarySource[],
      method: "none" as const,
      availability: "not_requested" as const,
      warnings: [] as BrainContextV1["warnings"],
    });

  const [
    dnaResult,
    styleResult,
    vaultResult,
    memoryResult,
    memoryConflictResult,
    marketResult,
    libraryResult,
  ] = await Promise.all([
    dnaPromise,
    stylePromise,
    vaultQuery,
    memoryPromise,
    memoryConflictPromise,
    marketPromise,
    libraryPromise,
  ]);
  for (const [section, result] of [
    ["Company DNA", dnaResult],
    ["style", styleResult],
    ["Vault", vaultResult],
    ["Brain memory", memoryResult],
    ["Brain memory conflicts", memoryConflictResult],
    ["market intelligence", marketResult],
  ] as const) {
    if (result.error) throw new Error(`${section} context failed: ${result.error.message}`);
  }

  const dna = (dnaResult.data ?? null) as Record<string, unknown> | null;
  const approvedStyle = (styleResult.data ?? null) as Record<string, unknown> | null;
  const vaultItems = (vaultResult.data ?? []) as VaultItemRow[];
  const memoryRows = (memoryResult.data ?? []) as MemoryRow[];
  const memoryConflicts = (memoryConflictResult.data ?? []) as MemoryConflictRow[];
  const marketRun = (marketResult.data ?? null) as {
    id: string;
    analysis: Record<string, unknown>;
  } | null;
  warnings.push(...libraryResult.warnings);

  if (explicitSelection && selectedIds.length) {
    const found = new Set(vaultItems.map((item) => item.id));
    const missing = selectedIds.filter((id) => !found.has(id));
    if (missing.length) {
      warnings.push({
        code: "selected_vault_sources_unavailable",
        message: `${missing.length} selected Vault source${missing.length === 1 ? " is" : "s are"} no longer available.`,
        severity: "blocking",
      });
    }
  }

  const companyFields: Record<string, string> = {};
  if (dna) {
    for (const key of COMPANY_FIELDS) {
      const value = compact(dna[key]);
      if (value) companyFields[key] = value;
    }
    const extra = compact(dna.extra, 10_000);
    if (extra && extra !== "{}") companyFields.extra = extra;
  } else {
    warnings.push({
      code: "company_dna_missing",
      message: "Company DNA is not configured; only retrieved Vault material can be used.",
      severity: request.surface === "content" ? "warning" : "info",
    });
  }

  const titleById = new Map(vaultItems.map((item) => [item.id, item]));
  const knowledgeSources: BrainKnowledgeSource[] = [];
  const sourceKeys = new Set<string>();
  const addSource = (source: BrainKnowledgeSource) => {
    const key = `${source.itemId}:${source.chunkId ?? "item"}`;
    if (sourceKeys.has(key) || knowledgeSources.length >= maxKnowledge) return;
    sourceKeys.add(key);
    knowledgeSources.push(source);
  };

  if (explicitSelection && selectedIds.length) {
    for (const item of vaultItems) {
      const excerpt = compact(item.ai_summary || item.raw_content, 4_000);
      if (!excerpt) continue;
      addSource({
        itemId: item.id,
        chunkId: null,
        title: safeTitle(item.title),
        excerpt,
        category: item.category,
        sourceUrl: safeUrl(item.source_url),
        selectionMethod: "selected",
        relevance: 1,
        selectionReason: "Explicitly selected by the editor.",
      });
    }
  } else if (!explicitSelection && retrievalQuery && args.embed) {
    try {
      const embedding = await args.embed(retrievalQuery.slice(0, 1_500));
      const { data: chunks, error } = await admin.rpc("match_vault_chunks", {
        p_client_id: clientId,
        p_query_embedding: embedding,
        p_match_count: Math.min(maxKnowledge, 20),
      });
      if (error) throw error;
      const semanticChunks = (chunks ?? []) as ChunkRow[];
      const missingItemIds = unique(
        semanticChunks
          .map((chunk) => chunk.item_id)
          .filter((itemId) => !titleById.has(itemId)),
      );
      if (missingItemIds.length) {
        const { data: missingItems, error: missingError } = await admin
          .from("vault_items")
          .select("id,title,raw_content,ai_summary,category,source_url,updated_at")
          .eq("client_id", clientId)
          .in("id", missingItemIds)
          .eq("status", "ready")
          .eq("evidence_role", "factual")
          .eq("knowledge_status", "active")
          .eq("has_conflict", false);
        if (missingError) throw missingError;
        for (const item of (missingItems ?? []) as VaultItemRow[]) {
          vaultItems.push(item);
          titleById.set(item.id, item);
        }
      }
      for (const chunk of semanticChunks) {
        if (chunk.similarity < 0.25) continue;
        const item = titleById.get(chunk.item_id);
        if (!item) continue;
        addSource({
          itemId: chunk.item_id,
          chunkId: chunk.id,
          title: safeTitle(item.title),
          excerpt: compact(chunk.content, 4_000),
          category: item.category,
          sourceUrl: safeUrl(item.source_url),
          selectionMethod: "semantic",
          relevance: Math.max(0, Math.min(1, chunk.similarity)),
          selectionReason: "Semantic match to the current task.",
        });
      }
    } catch (error) {
      console.warn("brain-context: semantic retrieval unavailable", error);
      warnings.push({
        code: "semantic_retrieval_unavailable",
        message: "Semantic retrieval was unavailable; lexical Vault matching was used.",
        severity: "warning",
      });
    }
  }

  const terms = queryTerms(retrievalQuery);
  const fallbackItems = vaultItems
    .map((item) => ({ item, score: lexicalScore(item, terms) }))
    .filter(({ item }) => compact(item.ai_summary || item.raw_content).length > 0)
    .sort((left, right) =>
      right.score - left.score ||
      String(right.item.updated_at ?? "").localeCompare(String(left.item.updated_at ?? "")) ||
      left.item.id.localeCompare(right.item.id));
  for (const { item, score } of fallbackItems) {
    if (knowledgeSources.some((source) => source.itemId === item.id)) continue;
    if (terms.length && score <= 0 && knowledgeSources.length >= Math.min(4, maxKnowledge)) continue;
    addSource({
      itemId: item.id,
      chunkId: null,
      title: safeTitle(item.title),
      excerpt: compact(item.ai_summary || item.raw_content, 4_000),
      category: item.category,
      sourceUrl: safeUrl(item.source_url),
      selectionMethod: terms.length ? "full_text" : "fallback",
      relevance: terms.length ? score : null,
      selectionReason: terms.length
        ? "Lexical match to the current task."
        : "Recent active Vault material used as fallback context.",
    });
  }

  const resolvedDna = {
    ...(dna ?? {}),
    style_analysis_profiles: approvedStyle && request.channel
      ? { [request.channel]: approvedStyle }
      : {},
  };
  const channel = request.channel ?? null;
  let style: BrainContextV1["style"];
  if (frozenStyleSnapshot && channel) {
    style = styleFromFrozenSnapshot(frozenStyleSnapshot, channel);
  } else if (channel) {
    const resolved = resolveContentStyle(resolvedDna, channel, requestedTone, lengthHint);
    const channelStyles = dna?.channel_styles;
    const hasChannelStyle = Boolean(
      channelStyles &&
      typeof channelStyles === "object" &&
      !Array.isArray(channelStyles) &&
      compact((channelStyles as Record<string, unknown>)[channel]),
    );
    const hasGlobalStyle = Boolean(
      compact(dna?.brand_voice) ||
      compact(dna?.content_style) ||
      compact(dna?.internal_rules) ||
      compact(dna?.preferred_terms),
    );
    const source = resolved.styleAnalysis
      ? "approved_channel_analysis"
      : hasChannelStyle
        ? "company_channel_style"
        : hasGlobalStyle || resolved.hardRules.length
          ? "company_global_style"
          : "generic_fallback";
    style = {
      source,
      profileId: resolved.styleAnalysis?.id ?? null,
      profileVersion: styleVersion(approvedStyle),
      channel,
      confidence: styleConfidence(
        approvedStyle?.analysis && typeof approvedStyle.analysis === "object"
          ? approvedStyle.analysis as Record<string, unknown>
          : null,
      ),
      resolvedInstructions: resolved.summary.length
        ? resolved.summary.map((entry) => entry.slice(0, 1_000)).slice(0, 100)
        : ["Use a clear, professional style appropriate to the selected channel."],
      hardRules: safeHardRules(resolved.hardRules),
      ...(source === "generic_fallback"
        ? { fallbackReason: "No approved style analysis or explicit Company DNA style is configured." }
        : {}),
    };
  } else {
    style = {
      source: "generic_fallback",
      profileId: null,
      profileVersion: null,
      channel: null,
      confidence: null,
      resolvedInstructions: ["Use a clear, professional style appropriate to the task."],
      hardRules: [],
      fallbackReason: "This task does not specify a content channel.",
    };
  }

  const applicableMemoryRows = memoryRows
    .filter((memory) => brainMemoryScopeMatches(memory.scope, {
      surface: request.surface,
      channel: request.channel,
      contentType: request.contentType,
      audience: request.audience,
      objective: request.objective,
    }))
    .filter((memory) => memory.content.trim().length > 0)
    .sort((left, right) =>
      (right.rank_score ?? 0) - (left.rank_score ?? 0) ||
      Number(right.pinned) - Number(left.pinned) ||
      right.confidence - left.confidence ||
      left.id.localeCompare(right.id));
  const memories = selectBrainMemoryBudget(applicableMemoryRows)
    .map((memory) => ({
      memoryId: memory.id,
      kind: memory.kind,
      content: memory.content.trim().slice(0, 2_000),
      confidence: Math.max(0, Math.min(100, memory.confidence)),
      pinned: memory.pinned,
      scope: normalizeBrainMemoryScope(memory.scope),
      relevance: typeof memory.semantic_relevance === "number"
        ? Math.max(0, Math.min(1, memory.semantic_relevance))
        : null,
      rankScore: typeof memory.rank_score === "number"
        ? Math.max(0, Math.min(1, memory.rank_score))
        : null,
      selectionReason: memory.selection_reason?.trim() ||
        (memory.pinned
          ? "Pinned lesson applicable to this task."
          : `Task scope match (${Math.round(brainMemoryScopeSpecificity(memory.scope) * 100)}% specificity).`),
    }));

  if (memoryConflicts.length) {
    warnings.push({
      code: "brain_memory_conflict_review",
      message: (memoryConflicts[0].conflict_summary || `A learned lesson conflicts with newer feedback: ${memoryConflicts[0].content}`)
        .trim()
        .slice(0, 1_000),
      severity: "warning",
    });
  }

  const marketInsights = marketRun && request.includeMarketIntelligence
    ? insightRows(marketRun.id, marketRun.analysis ?? {})
    : [];
  if (request.includeMarketIntelligence && !marketRun) {
    warnings.push({
      code: "market_intelligence_unavailable",
      message: "No completed competitor intelligence report is available.",
      severity: "info",
    });
  }

  const vaultItemIds = unique(knowledgeSources.map((source) => source.itemId));
  const vaultChunkIds = unique(
    knowledgeSources.flatMap((source) => source.chunkId ? [source.chunkId] : []),
  );
  const marketSnapshotIds = marketRun && request.includeMarketIntelligence ? [marketRun.id] : [];

  return {
    version: BRAIN_CONTEXT_VERSION,
    clientId,
    request: {
      ...request,
      selectedVaultSourceIds: selectedIds,
    },
    company: {
      fields: companyFields,
      companyDnaUpdatedAt: typeof dna?.updated_at === "string" ? dna.updated_at : null,
    },
    knowledge: {
      sources: knowledgeSources,
      retrievalQuery,
      retrievalMethod: explicitSelection
        ? "explicit_selection"
        : args.embed
          ? "hybrid_semantic_lexical"
          : "lexical_fallback",
      coverage: coverageFor(knowledgeSources),
    },
    library: {
      sources: libraryResult.sources,
      retrievalQuery,
      retrievalMethod: libraryResult.method,
      coverage: coverageFor(libraryResult.sources),
      availability: libraryResult.availability,
    },
    style,
    memories,
    market: {
      included: request.includeMarketIntelligence && Boolean(marketRun),
      snapshotIds: marketSnapshotIds,
      insights: marketInsights,
    },
    warnings,
    provenance: {
      resolverVersion: BRAIN_RESOLVER_VERSION,
      generatedAt,
      model: args.model ?? null,
      promptVersion: args.promptVersion ?? null,
      companyDnaUpdatedAt: typeof dna?.updated_at === "string" ? dna.updated_at : null,
      styleProfileId: style.profileId,
      styleProfileVersion: style.profileVersion,
      vaultItemIds,
      vaultChunkIds,
      libraryEntryIds: unique(libraryResult.sources.map((source) => source.entryId)),
      libraryVersionIds: unique(libraryResult.sources.map((source) => source.versionId)),
      libraryChunkIds: unique(
        libraryResult.sources.flatMap((source) => source.chunkId ? [source.chunkId] : []),
      ),
      memoryIds: memories.map((memory) => memory.memoryId),
      marketSnapshotIds,
    },
  };
}

export function renderBrainContext(context: BrainContextV1): string {
  const sections: string[] = [];
  const companyLines = Object.entries(context.company.fields)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`);
  if (companyLines.length) {
    sections.push(`=== COMPANY CONTEXT ===\n${companyLines.join("\n")}`);
  }
  if (context.knowledge.sources.length) {
    sections.push(
      "=== COMPANY VAULT KNOWLEDGE ===\n" +
      context.knowledge.sources.map((source) =>
        `--- SOURCE ${source.itemId}${source.chunkId ? ` / CHUNK ${source.chunkId}` : ""} — ${source.title} ---\n${source.excerpt}`
      ).join("\n\n"),
    );
  }
  if (context.library.sources.length) {
    sections.push(
      "=== BUSINESS LIBRARY GUIDANCE (GENERAL GUIDANCE — NEVER COMPANY FACTS) ===\n" +
      "Use this material for best-practice advice only. Adapt it to the company context, and never claim the company already follows it.\n" +
      context.library.sources.map((source) =>
        `--- LIBRARY ${source.entryId} / VERSION ${source.versionId}${source.chunkId ? ` / CHUNK ${source.chunkId}` : ""} — ${source.title} ---\n${source.excerpt}`
      ).join("\n\n"),
    );
  }
  if (context.style.resolvedInstructions.length) {
    sections.push(
      "=== APPLIED VOICE AND STYLE ===\n" +
      context.style.resolvedInstructions.map((instruction) => `• ${instruction}`).join("\n"),
    );
  }
  if (context.style.hardRules.length) {
    sections.push(
      "=== ENFORCEABLE HARD RULES ===\n" +
      context.style.hardRules.map((rule) => JSON.stringify(rule)).join("\n"),
    );
  }
  if (context.memories.length) {
    const labels = { preference: "Prefer", anti_pattern: "Avoid", rule: "Rule" };
    sections.push(
      "=== APPROVED EDITORIAL LESSONS ===\n" +
      context.memories.map((memory) => `• ${labels[memory.kind]}: ${memory.content}`).join("\n"),
    );
  }
  if (context.market.included && context.market.insights.length) {
    sections.push(
      "=== MARKET INSPIRATION (NOT COMPANY FACTS OR OWNED STYLE) ===\n" +
      context.market.insights.map((insight) =>
        `• [${insight.kind}] ${insight.summary}`
      ).join("\n"),
    );
  }
  return sections.length ? `${sections.join("\n\n")}\n` : "";
}

export async function persistBrainContextSnapshot(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  context: BrainContextV1;
  artifactKind?: string | null;
  artifactId?: string | null;
  createdBy?: string | null;
}): Promise<{ id: string; snapshotHash: string }> {
  const { data, error } = await args.admin
    .from("brain_context_snapshots")
    .insert({
      client_id: args.context.clientId,
      version: args.context.version,
      resolver_version: args.context.provenance.resolverVersion,
      surface: args.context.request.surface,
      channel: args.context.request.channel ?? null,
      artifact_kind: args.artifactKind ?? null,
      artifact_id: args.artifactId ?? null,
      request: args.context.request,
      snapshot: args.context,
      snapshot_hash: "0".repeat(64),
      model: args.context.provenance.model,
      prompt_version: args.context.provenance.promptVersion,
      created_by: args.createdBy ?? null,
    })
    .select("id,snapshot_hash")
    .single();
  if (error || !data?.id || !data?.snapshot_hash) {
    throw new Error(`Brain context snapshot failed: ${error?.message ?? "missing row"}`);
  }
  return { id: data.id, snapshotHash: data.snapshot_hash };
}
