import { z } from "zod";
import { chatModel } from "@/lib/brain/llm";
import { contentTypeFromGeneratedFormat } from "@/lib/content/idea-channel";

export const VALID_TYPES = new Set([
  "email",
  "x",
  "linkedin",
  "facebook",
  "instagram",
  "newsletter",
  "blog",
]);

export const VALID_OPPORTUNITY_TYPES = new Set([
  "gap",
  "differentiation",
  "counter_position",
  "market_pattern",
]);

export interface CompetitorEvidence {
  id: string;
  competitor_id: string;
  competitor_name: string;
  canonical_url: string;
  platform: string;
  content_type: string;
  title: string;
  raw_content: string;
  published_at: string | null;
  captured_at: string;
}

export interface IdeaVaultEvidence {
  id: string;
  title: string;
  ai_summary: string | null;
  raw_content: string | null;
}

export interface ExistingCompanyContent {
  id: string;
  title: string;
  content_type: string;
  body: string | null;
}

const generatedTopicSchema = z.object({
  title: z.string().trim().min(1).max(300),
  hook: z.string().trim().min(1).max(500),
  topic: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(2000),
  content_type: z.enum(["email", "x", "linkedin", "facebook", "instagram", "newsletter", "blog"]),
  intended_audience: z.string().trim().min(1).max(1000),
  strategic_objective: z.string().trim().min(1).max(1200),
  why_valuable: z.string().trim().min(1).max(1600),
  company_dna_fit: z.string().trim().min(1).max(1600),
  vault_evidence_ids: z.array(z.string().uuid()).max(8),
  rationale: z.string().trim().min(1).max(2000),
  fit: z.number().int().min(0).max(100),
  opportunity_type: z.enum(["gap", "differentiation", "counter_position", "market_pattern"]).nullable(),
  evidence_summary: z.string().trim().min(1).max(1000),
  evidence_ids: z.array(z.string().uuid()).max(5),
  difference_from_competitors: z.string().max(1600),
  existing_content_ids: z.array(z.string().uuid()).max(8),
  difference_from_existing: z.string().trim().min(1).max(1600),
  recommended_format: z.string().trim().min(1).max(500),
  recommended_cta: z.string().trim().min(1).max(800),
}).passthrough();

const generatedTopicsSchema = z.object({
  topics: z.array(z.unknown()),
}).passthrough();

export type GeneratedTopic = z.infer<typeof generatedTopicSchema>;

export interface GeneratedTopicBatch {
  topics: GeneratedTopic[];
  rejected: number;
}

function generatedText(
  candidate: Record<string, unknown>,
  key: string,
  fallback: string,
  max: number,
): string {
  const value = candidate[key];
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback.slice(0, max);
}

function generatedIds(candidate: Record<string, unknown>, key: string, max: number): string[] {
  const value = candidate[key];
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string"))].slice(0, max)
    : [];
}

function normalizeGeneratedTopic(candidate: unknown): GeneratedTopic | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  const title = generatedText(value, "title", "", 300);
  if (!title) return null;

  const description = generatedText(
    value,
    "description",
    generatedText(value, "rationale", title, 2_000),
    2_000,
  );
  const requestedType = typeof value.content_type === "string"
    ? value.content_type.toLocaleLowerCase()
    : "";
  const requestedContentType = VALID_TYPES.has(requestedType)
    ? requestedType as GeneratedTopic["content_type"]
    : "linkedin";
  const recommendedFormat = generatedText(
    value,
    "recommended_format",
    `${requestedContentType} post`,
    500,
  );
  const contentType = contentTypeFromGeneratedFormat(
    requestedContentType,
    recommendedFormat,
  );
  const rawFit = Number(value.fit);
  const fit = Number.isFinite(rawFit) ? Math.max(0, Math.min(100, Math.round(rawFit))) : 60;
  const requestedOpportunity = typeof value.opportunity_type === "string"
    ? value.opportunity_type
    : "";
  const opportunityType = VALID_OPPORTUNITY_TYPES.has(requestedOpportunity)
    ? requestedOpportunity as NonNullable<GeneratedTopic["opportunity_type"]>
    : null;

  return {
    title,
    hook: generatedText(value, "hook", title, 500),
    topic: generatedText(value, "topic", title, 300),
    description,
    content_type: contentType,
    intended_audience: generatedText(
      value,
      "intended_audience",
      "Audience requires editor confirmation.",
      1_000,
    ),
    strategic_objective: generatedText(
      value,
      "strategic_objective",
      "Build useful awareness with the intended audience.",
      1_200,
    ),
    why_valuable: generatedText(value, "why_valuable", description, 1_600),
    company_dna_fit: generatedText(
      value,
      "company_dna_fit",
      "Aligned using the available Company Brain context; editor review is recommended.",
      1_600,
    ),
    vault_evidence_ids: generatedIds(value, "vault_evidence_ids", 8),
    rationale: generatedText(value, "rationale", description, 2_000),
    fit,
    opportunity_type: opportunityType,
    evidence_summary: generatedText(
      value,
      "evidence_summary",
      "No external evidence summary was supplied.",
      1_000,
    ),
    evidence_ids: generatedIds(value, "evidence_ids", 5),
    difference_from_competitors: generatedText(value, "difference_from_competitors", "", 1_600),
    existing_content_ids: generatedIds(value, "existing_content_ids", 8),
    difference_from_existing: generatedText(
      value,
      "difference_from_existing",
      "No source-grounded comparison with existing company content was supplied.",
      1_600,
    ),
    recommended_format: recommendedFormat,
    recommended_cta: generatedText(
      value,
      "recommended_cta",
      "Invite the audience to take one relevant next step.",
      800,
    ),
  };
}

function decodeGeneratedCandidates(raw: string): unknown[] {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  const attempts = [
    unfenced,
    unfenced.slice(
      Math.max(0, unfenced.indexOf("{")),
      unfenced.lastIndexOf("}") >= 0 ? unfenced.lastIndexOf("}") + 1 : unfenced.length,
    ),
  ];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      const decoded: unknown = JSON.parse(attempt);
      const parsed = generatedTopicsSchema.safeParse(decoded);
      if (parsed.success) return parsed.data.topics;
      if (Array.isArray(decoded)) return decoded;
      if (
        decoded &&
        typeof decoded === "object" &&
        Array.isArray((decoded as { ideas?: unknown }).ideas)
      ) {
        return (decoded as { ideas: unknown[] }).ideas;
      }
    } catch {
      // Try the next bounded JSON representation.
    }
  }
  return [];
}

export class TopicProviderError extends Error {
  constructor(
    readonly code: string,
    readonly clientMessage: string,
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "TopicProviderError";
  }
}

function providerFailure(status: number): TopicProviderError {
  if (status === 401 || status === 403) {
    return new TopicProviderError(
      "CONTENT_AI_AUTH",
      "The content AI connection needs administrator attention. Please try again shortly.",
      502,
    );
  }
  if (status === 402) {
    return new TopicProviderError(
      "CONTENT_AI_LIMIT",
      "The content AI provider rejected the API key's balance or spending limit.",
      502,
    );
  }
  if (status === 429) {
    return new TopicProviderError(
      "CONTENT_AI_BUSY",
      "The content AI service is busy. Please wait a moment and try again.",
      503,
    );
  }
  if (status === 400 || status === 404) {
    return new TopicProviderError(
      "CONTENT_AI_MODEL",
      "The configured content model could not accept this request. An administrator needs to review it.",
      502,
    );
  }
  return new TopicProviderError(
    "CONTENT_AI_UNAVAILABLE",
    "The content AI service is temporarily unavailable. Please try again.",
    502,
  );
}

export async function requestGeneratedTopics(args: {
  llm: { url: string; key: string; provider: string };
  systemPrompt: string;
  userPrompt: string;
  count: number;
}): Promise<GeneratedTopicBatch> {
  const controller = new AbortController();
  // OpenRouter may queue an otherwise healthy request for 40–60 seconds. Keep
  // a hard bound below the route's 180-second ceiling, but do not discard a
  // usable batch at the old 50-second interactive cutoff.
  const timeoutMs = Math.min(110_000, 70_000 + args.count * 3_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(args.llm.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.llm.key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: chatModel("CONTENT_TOPICS_MODEL"),
        temperature: 0.6,
        // Twenty fully explainable ideas are materially larger than the default
        // eight. Scale the output budget with the accepted request count.
        max_tokens: Math.min(10_000, Math.max(1_800, args.count * 420)),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      let providerCode: string | undefined;
      try {
        const payload = await response.json() as {
          error?: { code?: string | number };
        };
        providerCode = payload.error?.code === undefined
          ? undefined
          : String(payload.error.code).slice(0, 80);
      } catch {
        // The status is sufficient for the client-safe error below.
      }
      console.error("[topics/generate] provider rejected request", {
        provider: args.llm.provider,
        model: chatModel("CONTENT_TOPICS_MODEL"),
        status: response.status,
        providerCode,
      });
      throw providerFailure(response.status);
    }
    const completion = await response.json();
    const raw = completion.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return { topics: [], rejected: 0 };
    const candidates = decodeGeneratedCandidates(raw);
    const topics = candidates.flatMap((candidate) => {
      const topic = generatedTopicSchema.safeParse(candidate);
      if (topic.success) return [topic.data];
      const normalized = normalizeGeneratedTopic(candidate);
      return normalized ? [normalized] : [];
    });
    return {
      topics,
      rejected: candidates.length - topics.length,
    };
  } catch (error) {
    if (error instanceof TopicProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TopicProviderError(
        "CONTENT_AI_TIMEOUT",
        "Idea generation took too long. Please try again.",
        504,
      );
    }
    throw new TopicProviderError(
      "CONTENT_AI_NETWORK",
      "The content AI service could not be reached. Please try again.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function escapePromptXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function renderCompetitorEvidence(items: CompetitorEvidence[]): string {
  return items.map((item) =>
    `<competitor_evidence id="${item.id}" competitor="${escapePromptXml(item.competitor_name)}" ` +
    `platform="${escapePromptXml(item.platform)}" content_type="${escapePromptXml(item.content_type)}" ` +
    `url="${escapePromptXml(item.canonical_url)}">\n` +
    `${escapePromptXml(item.raw_content.trim().slice(0, 2500))}\n</competitor_evidence>`
  ).join("\n\n").slice(0, 22_000);
}

export function renderIdeaEvidence(items: IdeaVaultEvidence[]): string {
  return items.map((item) =>
    `<vault_material id="${item.id}" title="${escapePromptXml(item.title.slice(0, 200))}">\n` +
    `${escapePromptXml((item.ai_summary || item.raw_content || "").trim().slice(0, 1400))}\n</vault_material>`
  ).join("\n\n").slice(0, 14_000);
}

export function renderExistingContent(items: ExistingCompanyContent[]): string {
  return items.map((item) =>
    `<company_content id="${item.id}" channel="${escapePromptXml(item.content_type)}" title="${escapePromptXml(item.title.slice(0, 200))}">\n` +
    `${escapePromptXml((item.body || "").trim().slice(0, 900))}\n</company_content>`
  ).join("\n\n").slice(0, 12_000);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    (value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu) ?? [])
      .filter((token) => ![
        "about", "after", "also", "and", "are", "but", "company", "content",
        "for", "from", "have", "into", "our", "that", "the", "their", "this",
        "through", "with", "your",
      ].includes(token)),
  );
}

export function similarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / new Set([...a, ...b]).size;
}

export function evidenceRelevance(idea: string, evidence: string): number {
  const ideaTerms = tokenSet(idea);
  const evidenceTerms = tokenSet(evidence);
  if (!ideaTerms.size || !evidenceTerms.size) return 0;
  const overlap = [...ideaTerms].filter((token) => evidenceTerms.has(token)).length;
  return overlap / Math.min(ideaTerms.size, 12);
}

export function dimension(score: number, explanation: string) {
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    explanation,
  };
}
