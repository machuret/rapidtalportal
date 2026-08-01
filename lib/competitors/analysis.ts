import { createHash } from "node:crypto";
import { z } from "zod";
import {
  competitorIntelligenceSchema,
  type CompetitorIntelligence,
  type CompetitorIntelligenceCompanySource,
} from "@/lib/competitors/intelligence";

export const sourceSnapshotSchema = z.object({
  item_id: z.string().uuid(),
  capture_version_id: z.string().uuid(),
  content_hash: z.string().min(16).max(256),
  competitor_id: z.string().uuid(),
  competitor_name: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  url: z.string().url(),
  platform: z.string().min(1).max(80),
  content_type: z.string().min(1).max(80),
  published_at: z.string().datetime({ offset: true }).nullable(),
  captured_at: z.string().datetime({ offset: true }),
  effective_at: z.string().datetime({ offset: true }),
  date_basis: z.enum(["published", "captured"]),
});
export const companySnapshotSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["content_piece", "vault_item"]),
  title: z.string().min(1).max(500),
  excerpt: z.string().max(2500),
  content_hash: z.string().min(16).max(256),
});

export interface EvidenceRow {
  id: string;
  capture_version_id: string;
  content_hash: string;
  competitor_id: string;
  canonical_url: string;
  platform: string;
  content_type: string;
  title: string;
  raw_content: string;
  published_at: string | null;
  captured_at: string;
  effective_at: string;
  date_basis: "published" | "captured";
}

export interface CompanyContentRow {
  id: string;
  title: string;
  brief: string | null;
  body: string | null;
  content_type: string;
  status: string;
  created_at: string;
}

export interface VaultRow {
  id: string;
  title: string;
  raw_content: string | null;
  ai_summary: string | null;
  category: string | null;
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "been", "before", "being",
  "but", "can", "company", "content", "could", "for", "from", "have", "into",
  "its", "more", "our", "that", "the", "their", "this", "those", "through",
  "using", "was", "were", "will", "with", "would", "your",
]);

export function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function compactWhitespace(value: string): string {
  return decodeEntities(value).normalize("NFKC").replace(/[“”]/gu, "\"").replace(/[‘’]/gu, "'")
    .replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function decodeEntities(value: string): string {
  const decodeCodePoint = (code: string, radix: number, fallback: string) => {
    const parsed = Number.parseInt(code, radix);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
      ? String.fromCodePoint(parsed)
      : fallback;
  };
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&apos;|&#39;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#(\d+);/gu, (match, code: string) =>
      decodeCodePoint(code, 10, match))
    .replace(/&#x([\da-f]+);/giu, (match, code: string) =>
      decodeCodePoint(code, 16, match));
}

const NEGATION_WORDS = new Set([
  "cannot", "can't", "didn't", "doesn't", "isn't", "neither", "never", "no",
  "nor", "not", "wasn't", "without", "won't", "wouldn't",
]);

function evidenceTokens(value: string): string[] {
  return decodeEntities(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

function negations(tokens: string[]): string {
  return tokens.filter((token) => NEGATION_WORDS.has(token)).sort().join("|");
}

function sourceQuoteCandidates(source: string, targetWords: number): string[] {
  const sentences = source.trim().slice(0, 3500)
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20 && sentence.length <= 500);
  const pairs = sentences.slice(0, -1)
    .map((sentence, index) => `${sentence} ${sentences[index + 1]}`)
    .filter((sentence) => sentence.length <= 500);
  const raw = source.trim().slice(0, 3500);
  const words = [...raw.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
  const sizes = [...new Set([
    Math.max(6, targetWords - 6),
    Math.max(6, targetWords),
    Math.min(60, targetWords + 6),
    Math.min(60, targetWords + 12),
  ])];
  const windows: string[] = [];
  for (const size of sizes) {
    for (let start = 0; start + size <= words.length; start++) {
      const first = words[start];
      const last = words[start + size - 1];
      if (first.index === undefined || last.index === undefined) continue;
      const candidate = raw.slice(first.index, last.index + last[0].length).trim();
      if (candidate.length >= 20 && candidate.length <= 500) windows.push(candidate);
    }
  }
  return [...sentences, ...pairs, ...windows];
}

function resolveExactSourceQuote(quote: string, source: string): string | null {
  const rawSource = source.trim().slice(0, 3500);
  if (rawSource.includes(quote)) return quote.trim();
  const requested = evidenceTokens(quote);
  if (requested.length < 4) return null;
  const requestedNegations = negations(requested);
  let best: { quote: string; score: number } | null = null;
  for (const candidate of sourceQuoteCandidates(rawSource, requested.length)) {
    const candidateTokens = evidenceTokens(candidate);
    if (negations(candidateTokens) !== requestedNegations) continue;
    const requestedSet = new Set(requested);
    const candidateSet = new Set(candidateTokens);
    let shared = 0;
    for (const token of requestedSet) if (candidateSet.has(token)) shared++;
    const requestedCoverage = shared / requestedSet.size;
    const candidateCoverage = shared / candidateSet.size;
    const score = Math.min(requestedCoverage, candidateCoverage);
    if (
      shared >= 6 &&
      requestedCoverage >= 0.7 &&
      candidateCoverage >= 0.55 &&
      (!best || score > best.score)
    ) {
      best = { quote: candidate, score };
    }
  }
  return best?.quote ?? null;
}

function meaningfulEvidenceTokens(value: string): string[] {
  const root = (token: string) => {
    if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
    return token;
  };
  return evidenceTokens(value)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .map(root);
}

function resolveSupportingSourceQuote(claim: string, source: string): string | null {
  const claimTokens = meaningfulEvidenceTokens(claim);
  if (claimTokens.length < 3) return null;
  const claimNegations = negations(evidenceTokens(claim));
  const claimSet = new Set(claimTokens);
  let best: { quote: string; score: number } | null = null;
  for (const candidate of sourceQuoteCandidates(source, 24)) {
    const candidateRawTokens = evidenceTokens(candidate);
    if (negations(candidateRawTokens) !== claimNegations) continue;
    const candidateSet = new Set(meaningfulEvidenceTokens(candidate));
    let shared = 0;
    for (const token of claimSet) if (candidateSet.has(token)) shared++;
    const claimCoverage = shared / claimSet.size;
    const candidateCoverage = candidateSet.size ? shared / candidateSet.size : 0;
    const score = (claimCoverage * 0.7) + (candidateCoverage * 0.3);
    if (
      shared >= 3 &&
      claimCoverage >= 0.25 &&
      candidateCoverage >= 0.12 &&
      (!best || score > best.score)
    ) {
      best = { quote: candidate, score };
    }
  }
  return best?.quote ?? null;
}

function canonicalEvidenceQuotes(
  sourceIds: string[],
  quotes: Array<{ source_item_id: string; quote: string }>,
  sourceById: Map<string, EvidenceRow>,
  insightText: string,
): Array<{ source_item_id: string; quote: string }> {
  const provided = new Map<string, string>();
  for (const evidence of quotes) {
    if (provided.has(evidence.source_item_id)) return [];
    provided.set(evidence.source_item_id, evidence.quote);
  }
  return sourceIds.flatMap((sourceId) => {
    const source = sourceById.get(sourceId);
    const quote = provided.get(sourceId);
    if (!source) return [];
    const exact = quote
      ? resolveExactSourceQuote(quote, source.raw_content)
      : null;
    const quoteHasUnresolvedNegation = quote &&
      negations(evidenceTokens(quote)).length > 0 &&
      !exact;
    const resolved = exact ?? (
      quoteHasUnresolvedNegation
        ? null
        : resolveSupportingSourceQuote(insightText, source.raw_content)
    );
    return resolved ? [{ source_item_id: sourceId, quote: resolved }] : [];
  });
}

function insightEvidenceText(value: Record<string, unknown>): string {
  const fields = [
    "label", "description", "summary", "name", "hook_pattern", "structure_pattern",
    "cta_pattern", "dimension", "opportunity", "title", "rationale", "objective",
    "why_valuable", "company_relevance", "differentiation",
    "difference_from_company_content", "suggested_hook",
  ];
  const lists = [
    "audience", "themes", "value_propositions", "tone", "suggested_angles",
    "key_points",
  ];
  return [
    ...fields.flatMap((field) =>
      typeof value[field] === "string" ? [value[field]] : []),
    ...lists.flatMap((field) =>
      Array.isArray(value[field])
        ? value[field].filter((entry): entry is string => typeof entry === "string")
        : []),
  ].join(" ");
}

function terms(value: string): Set<string> {
  return new Set(
    value.toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}'-]+/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAnalysisEnvelope(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const outer = value as Record<string, unknown>;
  const nested = ["analysis", "report", "result", "data"]
    .map((key) => outer[key])
    .find((candidate) =>
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate));
  const record = (nested ?? outer) as Record<string, unknown>;
  const array = (key: string) => Array.isArray(record[key]) ? record[key] : [];
  return {
    ...record,
    schema_version: 2,
    executive_summary:
      typeof record.executive_summary === "string" && record.executive_summary.trim()
        ? record.executive_summary.trim()
        : "This verified partial report reflects only the insights directly supported by the captured evidence.",
    topic_clusters: array("topic_clusters"),
    format_patterns: array("format_patterns"),
    positioning_profiles: array("positioning_profiles"),
    comparisons: array("comparisons"),
    positioning_gaps: array("positioning_gaps"),
    recommended_ideas: array("recommended_ideas"),
  };
}

function normalizeAnalysisItem(
  key: string,
  value: unknown,
  fallbackCompetitorIds: string[],
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = { ...(value as Record<string, unknown>) };
  const alias = (target: string, ...alternatives: string[]) => {
    if (item[target] !== undefined) return;
    const found = alternatives.find((field) => item[field] !== undefined);
    if (found) item[target] = item[found];
  };
  alias("source_item_ids", "sourceItemIds", "source_ids", "sourceIds");
  alias("competitor_ids", "competitorIds");
  alias("evidence_quotes", "evidenceQuotes", "evidence", "quotes");
  alias("company_reference_ids", "companyReferenceIds", "company_source_ids");
  alias("why_valuable", "whyValuable", "value");
  alias("suggested_hook", "suggestedHook", "hook");
  alias("key_points", "keyPoints");
  alias("overlap_warning", "overlapWarning");
  alias("company_relevance", "companyRelevance");
  alias(
    "difference_from_company_content",
    "differenceFromCompanyContent",
    "company_content_difference",
  );
  alias("recommended_channels", "recommendedChannels", "channels");
  alias("suggested_angles", "suggestedAngles", "angles");
  alias("signal_strength", "signalStrength");
  alias("company_fit", "companyFit");
  alias("gap_type", "gapType");
  alias("value_propositions", "valuePropositions");
  alias("hook_pattern", "hookPattern");
  alias("structure_pattern", "structurePattern");
  alias("cta_pattern", "ctaPattern");
  const text = (field: string, maximum: number) => {
    if (typeof item[field] === "string") {
      item[field] = item[field].trim().slice(0, maximum);
    }
  };
  const list = (field: string, maximumItems: number, maximumLength = 240) => {
    if (Array.isArray(item[field])) {
      item[field] = item[field]
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, maximumLength))
        .filter(Boolean)
        .slice(0, maximumItems);
    }
  };
  const identifiers = (field: string, maximumItems = 12) => {
    if (Array.isArray(item[field])) {
      item[field] = item[field]
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, maximumItems);
    }
  };
  const channel = (entry: string) => {
    const normalized = entry.trim().toLocaleLowerCase();
    if (["web", "website", "article", "articles"].includes(normalized)) return "blog";
    if (normalized === "twitter") return "x";
    return normalized;
  };
  const channelList = (field: string) => {
    if (Array.isArray(item[field])) {
      item[field] = [...new Set(item[field]
        .filter((entry): entry is string => typeof entry === "string")
        .map(channel)
        .filter((entry) =>
          ["linkedin", "facebook", "instagram", "x", "email", "blog", "newsletter"]
            .includes(entry)))].slice(0, 7);
    }
  };
  const quotes = () => {
    if (!Array.isArray(item.evidence_quotes)) return;
    const sourceIds = Array.isArray(item.source_item_ids)
      ? item.source_item_ids.filter((entry): entry is string => typeof entry === "string")
      : [];
    item.evidence_quotes = item.evidence_quotes.flatMap((entry, index) => {
      if (typeof entry === "string" && typeof sourceIds[index] === "string") {
        const content = entry.trim().slice(0, 500);
        return content.length >= 20
          ? [{ source_item_id: sourceIds[index], quote: content }]
          : [];
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const quote = entry as Record<string, unknown>;
      const sourceId = typeof quote.source_item_id === "string"
        ? quote.source_item_id
        : typeof quote.sourceItemId === "string"
          ? quote.sourceItemId
          : typeof quote.source_id === "string"
            ? quote.source_id
            : null;
      const quoteText = typeof quote.quote === "string"
        ? quote.quote
        : typeof quote.text === "string"
          ? quote.text
          : typeof quote.excerpt === "string"
            ? quote.excerpt
            : null;
      if (
        !sourceId ||
        !quoteText
      ) return [];
      const content = quoteText.trim().slice(0, 500);
      return content.length >= 20
        ? [{ source_item_id: sourceId, quote: content }]
        : [];
    }).slice(0, 12);
    if (
      (!Array.isArray(item.source_item_ids) || item.source_item_ids.length === 0) &&
      Array.isArray(item.evidence_quotes)
    ) {
      item.source_item_ids = item.evidence_quotes.flatMap((entry) =>
        entry && typeof entry === "object" && "source_item_id" in entry &&
          typeof entry.source_item_id === "string"
          ? [entry.source_item_id]
          : []);
    }
  };

  identifiers("source_item_ids");
  identifiers("competitor_ids");
  quotes();
  if (
    (!Array.isArray(item.competitor_ids) || item.competitor_ids.length === 0) &&
    fallbackCompetitorIds.length === 1
  ) {
    item.competitor_ids = fallbackCompetitorIds;
  }
  text("description", 1200);
  if (key === "topic_clusters") {
    text("label", 120);
    channelList("channels");
    const idSource = typeof item.id === "string"
      ? item.id
      : typeof item.label === "string" ? item.label : "";
    const normalizedId = idSource.toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 80)
      .replace(/-+$/gu, "");
    item.id = normalizedId.length >= 2 ? normalizedId : "verified-topic";
    if (!["emerging", "established"].includes(String(item.signal_strength))) {
      item.signal_strength = "emerging";
    }
  } else if (key === "format_patterns") {
    text("name", 120);
    text("hook_pattern", 400);
    text("structure_pattern", 600);
    text("cta_pattern", 400);
    channelList("channels");
  } else if (key === "positioning_profiles") {
    if (
      typeof item.competitor_id !== "string" &&
      typeof item.competitorId === "string"
    ) item.competitor_id = item.competitorId;
    if (typeof item.competitor_id !== "string" && fallbackCompetitorIds.length === 1) {
      item.competitor_id = fallbackCompetitorIds[0];
    }
    if (typeof item.summary !== "string" && typeof item.description === "string") {
      item.summary = item.description;
    }
    for (const field of ["audience", "themes", "value_propositions", "tone"]) {
      if (!Array.isArray(item[field])) item[field] = [];
    }
    list("audience", 10);
    list("themes", 10);
    list("value_propositions", 10);
    list("tone", 10);
    text("summary", 1200);
  } else if (key === "comparisons") {
    text("dimension", 120);
    text("opportunity", 1200);
    if (Array.isArray(item.observations)) {
      item.observations = item.observations.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const observation = entry as Record<string, unknown>;
        return typeof observation.competitor_id === "string" &&
            typeof observation.value === "string"
          ? [{
              competitor_id: observation.competitor_id,
              value: observation.value.trim().slice(0, 500),
            }]
          : [];
      }).slice(0, 20);
    }
  } else if (key === "positioning_gaps") {
    text("title", 180);
    text("rationale", 1200);
    channelList("recommended_channels");
    list("suggested_angles", 10);
    if (!["topic", "audience", "format", "proof", "positioning", "counter_position"]
      .includes(String(item.gap_type))) {
      item.gap_type = "positioning";
    }
    if (!["low", "medium", "high"].includes(String(item.company_fit))) {
      item.company_fit = "medium";
    }
  } else if (key === "recommended_ideas") {
    text("title", 220);
    text("format", 120);
    text("objective", 1200);
    text("why_valuable", 1200);
    text("differentiation", 1200);
    text("suggested_hook", 500);
    text("overlap_warning", 600);
    text("company_relevance", 1200);
    text("difference_from_company_content", 1200);
    list("key_points", 10);
    identifiers("company_reference_ids");
    if (!Array.isArray(item.company_reference_ids)) item.company_reference_ids = [];
    if (typeof item.channel === "string") item.channel = channel(item.channel);
    if (!["new", "adjacent", "overlap"].includes(String(item.novelty))) {
      item.novelty = "new";
    }
    if (!["low", "medium", "high"].includes(String(item.confidence))) {
      item.confidence = "low";
    }
  }
  return item;
}

export function salvageAnalysisEnvelope(
  value: unknown,
  fallbackCompetitorIds: string[] = [],
): CompetitorIntelligence | null {
  const normalized = normalizeAnalysisEnvelope(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const record = normalized as Record<string, unknown>;
  const shape = competitorIntelligenceSchema.shape;
  const parseItems = <T>(
    key: string,
    parser: z.ZodType<T>,
    maximum: number,
  ): T[] => {
    const candidates = Array.isArray(record[key]) ? record[key].slice(0, maximum) : [];
    return candidates.flatMap((candidate) => {
      const result = parser.safeParse(
        normalizeAnalysisItem(key, candidate, fallbackCompetitorIds),
      );
      return result.success ? [result.data] : [];
    });
  };
  const executiveSummary =
    typeof record.executive_summary === "string" && record.executive_summary.trim()
      ? record.executive_summary.trim().slice(0, 1200)
      : "This verified partial report reflects only the insights directly supported by the captured evidence.";
  const salvaged = competitorIntelligenceSchema.safeParse({
    schema_version: 2,
    executive_summary: executiveSummary,
    topic_clusters: parseItems("topic_clusters", shape.topic_clusters.element, 6),
    format_patterns: parseItems("format_patterns", shape.format_patterns.element, 5),
    positioning_profiles: parseItems(
      "positioning_profiles",
      shape.positioning_profiles.element,
      10,
    ),
    comparisons: parseItems("comparisons", shape.comparisons.element, 5),
    positioning_gaps: parseItems("positioning_gaps", shape.positioning_gaps.element, 6),
    recommended_ideas: parseItems(
      "recommended_ideas",
      shape.recommended_ideas.element,
      6,
    ),
  });
  return salvaged.success && analysisHasAnyInsight(salvaged.data)
    ? salvaged.data
    : null;
}

export function analysisHasAnyInsight(analysis: CompetitorIntelligence): boolean {
  return (
    analysis.topic_clusters.length +
    analysis.format_patterns.length +
    analysis.positioning_profiles.length +
    analysis.comparisons.length +
    analysis.positioning_gaps.length +
    analysis.recommended_ideas.length
  ) > 0;
}

export function interleave<T>(groups: T[][]): T[] {
  const result: T[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index++) {
    for (const group of groups) {
      if (group[index]) result.push(group[index]);
    }
  }
  return result;
}

export function renderEvidence(
  rows: EvidenceRow[],
  names: Map<string, string>,
): { text: string; rows: EvidenceRow[]; characterCount: number } {
  let text = "";
  let characterCount = 0;
  const included: EvidenceRow[] = [];
  for (const row of rows) {
    const content = row.raw_content.trim().slice(0, 3500);
    if (content.length < 100) continue;
    const block =
      `<competitor_item id="${row.id}" capture_version_id="${row.capture_version_id}" ` +
      `competitor_id="${row.competitor_id}" ` +
      `competitor="${escapeXml(names.get(row.competitor_id) ?? "Competitor")}" ` +
      `platform="${escapeXml(row.platform)}" content_type="${escapeXml(row.content_type)}" ` +
      `effective_at="${escapeXml(row.effective_at)}" date_basis="${row.date_basis}" ` +
      `url="${escapeXml(row.canonical_url)}">\n` +
      `<title>${escapeXml(row.title.slice(0, 240))}</title>\n` +
      `<content>${escapeXml(content)}</content>\n</competitor_item>\n\n`;
    if (text.length + block.length > 42_000) break;
    text += block;
    characterCount += content.length;
    included.push(row);
  }
  return { text, rows: included, characterCount };
}

export function rankCompanySources(
  contentRows: CompanyContentRow[],
  vaultRows: VaultRow[],
  queryText: string,
): CompetitorIntelligenceCompanySource[] {
  const queryTerms = terms(queryText);
  const score = (value: string) => {
    const valueTerms = terms(value);
    let overlap = 0;
    for (const term of valueTerms) if (queryTerms.has(term)) overlap++;
    return overlap;
  };
  const companyContent = contentRows.map((row) => {
    const excerpt = [row.brief, row.body].filter(Boolean).join("\n").trim().slice(0, 2200);
    return {
      id: row.id,
      kind: "content_piece" as const,
      title: row.title,
      excerpt,
      content_hash: hashText(`${row.title}\n${excerpt}`),
      score: score(`${row.title} ${excerpt}`) + (row.status === "approved" ? 2 : 0),
      created_at: row.created_at,
    };
  }).filter((source) => source.excerpt);
  const vaultContent = vaultRows.map((row) => {
    const excerpt = [row.ai_summary, row.raw_content].filter(Boolean).join("\n").trim().slice(0, 2200);
    return {
      id: row.id,
      kind: "vault_item" as const,
      title: row.title,
      excerpt,
      content_hash: hashText(`${row.title}\n${excerpt}`),
      score: score(`${row.title} ${row.category ?? ""} ${excerpt}`),
      created_at: "",
    };
  }).filter((source) => source.excerpt);

  const sortSources = <T extends { score: number; created_at: string }>(sources: T[]) =>
    sources.sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at));
  return [
    ...sortSources(companyContent).slice(0, 10),
    ...sortSources(vaultContent).slice(0, 10),
  ].map((source) => ({
    id: source.id,
    kind: source.kind,
    title: source.title,
    excerpt: source.excerpt,
    content_hash: source.content_hash,
  }));
}

export function renderCompanySources(sources: CompetitorIntelligenceCompanySource[]): string {
  let result = "";
  for (const source of sources) {
    const block =
      `<company_reference id="${source.id}" kind="${source.kind}" title="${escapeXml(source.title)}">\n` +
      `${escapeXml(source.excerpt)}\n</company_reference>\n\n`;
    if (result.length + block.length > 18_000) break;
    result += block;
  }
  return result;
}

function citedEvidenceIsValid(
  sourceIds: string[],
  quotes: Array<{ source_item_id: string; quote: string }>,
  sourceById: Map<string, EvidenceRow>,
  minimum: number,
): boolean {
  if (sourceIds.length < minimum || new Set(sourceIds).size !== sourceIds.length) return false;
  const quoteBySource = new Map<string, string>();
  for (const evidence of quotes) {
    if (quoteBySource.has(evidence.source_item_id)) return false;
    quoteBySource.set(evidence.source_item_id, evidence.quote);
  }
  if (quoteBySource.size !== sourceIds.length) return false;
  return sourceIds.every((id) => {
    const source = sourceById.get(id);
    const quote = quoteBySource.get(id);
    if (!source || !quote) return false;
    const normalizedQuote = compactWhitespace(quote);
    return normalizedQuote.split(/\s+/u).length >= 4 &&
      compactWhitespace(source.raw_content.trim().slice(0, 3500)).includes(normalizedQuote);
  });
}

function evidenceStats(ids: string[], sourceById: Map<string, EvidenceRow>) {
  const rows = ids.map((id) => sourceById.get(id)).filter((row): row is EvidenceRow => !!row);
  return {
    sourceCount: rows.length,
    competitorCount: new Set(rows.map((row) => row.competitor_id)).size,
    dateCount: new Set(rows.map((row) => row.effective_at.slice(0, 10))).size,
    fallbackCount: rows.filter((row) => row.date_basis === "captured").length,
  };
}

function deterministicConfidence(
  ids: string[],
  sourceById: Map<string, EvidenceRow>,
): "low" | "medium" | "high" {
  const stats = evidenceStats(ids, sourceById);
  const fallbackRatio = stats.sourceCount ? stats.fallbackCount / stats.sourceCount : 1;
  if (
    stats.sourceCount >= 5 &&
    stats.dateCount >= 3 &&
    (stats.competitorCount >= 2 || stats.sourceCount >= 7) &&
    fallbackRatio < 0.5
  ) return "high";
  if (
    stats.sourceCount >= 3 &&
    (stats.dateCount >= 2 || stats.competitorCount >= 2) &&
    fallbackRatio < 1
  ) return "medium";
  return "low";
}

function deterministicSignalStrength(
  ids: string[],
  sourceById: Map<string, EvidenceRow>,
): "emerging" | "established" {
  const stats = evidenceStats(ids, sourceById);
  return stats.sourceCount >= 3 &&
    (stats.dateCount >= 2 || stats.competitorCount >= 2)
    ? "established"
    : "emerging";
}

export function boundAnalysis(
  analysis: CompetitorIntelligence,
  sourceById: Map<string, EvidenceRow>,
  validCompetitorIds: Set<string>,
  validCompanyReferenceIds: Set<string>,
): CompetitorIntelligence {
  const competitorsAreValid = (ids: string[]) =>
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => validCompetitorIds.has(id));
  const provenanceMatches = (ids: string[], idsOfCompetitors: string[]) => {
    const declared = new Set(idsOfCompetitors);
    const supported = new Set(ids.map((id) => sourceById.get(id)?.competitor_id));
    return ids.every((id) => declared.has(sourceById.get(id)?.competitor_id ?? "")) &&
      idsOfCompetitors.every((id) => supported.has(id));
  };
  const evidenceValid = (
    ids: string[],
    quotes: Array<{ source_item_id: string; quote: string }>,
    minimum: number,
  ) => citedEvidenceIsValid(ids, quotes, sourceById, minimum);
  const canonicalize = <
    T extends {
      source_item_ids: string[];
      evidence_quotes: Array<{ source_item_id: string; quote: string }>;
    },
  >(entry: T): T => {
    const evidenceQuotes = canonicalEvidenceQuotes(
      entry.source_item_ids,
      entry.evidence_quotes,
      sourceById,
      insightEvidenceText(entry),
    );
    const requiredMatches = Math.ceil((entry.source_item_ids.length * 2) / 3);
    if (evidenceQuotes.length < requiredMatches) {
      return { ...entry, source_item_ids: [], evidence_quotes: [] };
    }
    const supportedSourceIds = evidenceQuotes.map((quote) => quote.source_item_id);
    const supportedCompetitorIds = [...new Set(supportedSourceIds.flatMap((sourceId) => {
      const competitorId = sourceById.get(sourceId)?.competitor_id;
      return competitorId ? [competitorId] : [];
    }))];
    return {
      ...entry,
      source_item_ids: supportedSourceIds,
      evidence_quotes: evidenceQuotes,
      ...("competitor_ids" in entry
        ? { competitor_ids: supportedCompetitorIds }
        : {}),
    };
  };

  return {
    ...analysis,
    topic_clusters: analysis.topic_clusters.map(canonicalize)
      .filter((entry) =>
        evidenceValid(entry.source_item_ids, entry.evidence_quotes, 2) &&
        competitorsAreValid(entry.competitor_ids) &&
        provenanceMatches(entry.source_item_ids, entry.competitor_ids))
      .map((entry) => ({
        ...entry,
        signal_strength: deterministicSignalStrength(entry.source_item_ids, sourceById),
      })),
    format_patterns: analysis.format_patterns.map(canonicalize).filter((entry) =>
      evidenceValid(entry.source_item_ids, entry.evidence_quotes, 2) &&
      competitorsAreValid(entry.competitor_ids) &&
      provenanceMatches(entry.source_item_ids, entry.competitor_ids)),
    positioning_profiles: analysis.positioning_profiles.map(canonicalize).filter((entry) =>
      validCompetitorIds.has(entry.competitor_id) &&
      evidenceValid(entry.source_item_ids, entry.evidence_quotes, 1) &&
      entry.source_item_ids.every((id) =>
        sourceById.get(id)?.competitor_id === entry.competitor_id)),
    comparisons: analysis.comparisons.map(canonicalize).filter((entry) =>
      evidenceValid(entry.source_item_ids, entry.evidence_quotes, 2) &&
      entry.observations.every((observation) =>
        validCompetitorIds.has(observation.competitor_id)) &&
      new Set(entry.observations.map((observation) => observation.competitor_id)).size >= 2 &&
      provenanceMatches(
        entry.source_item_ids,
        [...new Set(entry.observations.map((observation) => observation.competitor_id))],
      )),
    positioning_gaps: analysis.positioning_gaps.map(canonicalize).filter((entry) =>
      evidenceValid(entry.source_item_ids, entry.evidence_quotes, 2) &&
      competitorsAreValid(entry.competitor_ids) &&
      provenanceMatches(entry.source_item_ids, entry.competitor_ids)),
    recommended_ideas: analysis.recommended_ideas.map(canonicalize)
      .filter((entry) =>
        evidenceValid(entry.source_item_ids, entry.evidence_quotes, 2) &&
        competitorsAreValid(entry.competitor_ids) &&
        provenanceMatches(entry.source_item_ids, entry.competitor_ids) &&
        new Set(entry.company_reference_ids).size === entry.company_reference_ids.length &&
        entry.company_reference_ids.every((id) => validCompanyReferenceIds.has(id)) &&
        (validCompanyReferenceIds.size === 0 || entry.company_reference_ids.length > 0))
      .map((entry) => ({
        ...entry,
        confidence: deterministicConfidence(entry.source_item_ids, sourceById),
      })),
  };
}

export function sourceSnapshots(
  rows: EvidenceRow[],
  names: Map<string, string>,
): z.infer<typeof sourceSnapshotSchema>[] {
  return rows.map((row) => ({
    item_id: row.id,
    capture_version_id: row.capture_version_id,
    content_hash: row.content_hash,
    competitor_id: row.competitor_id,
    competitor_name: names.get(row.competitor_id) ?? "Competitor",
    title: row.title,
    url: row.canonical_url,
    platform: row.platform,
    content_type: row.content_type,
    published_at: row.published_at,
    captured_at: row.captured_at,
    effective_at: row.effective_at,
    date_basis: row.date_basis,
  }));
}
