/**
 * Supabase Edge Function: content-generate
 * 
 * Generates business content (emails, social posts, newsletters, blog posts)
 * using OpenAI with Company DNA + Vault context. Runs globally at the edge
 * with no cold starts and consistent sub-second response initiation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { memoryAppliesToSurfaces } from "../_shared/brain-surfaces.ts";
import { retrieveContentVault } from "../_shared/content-vault-retrieval.ts";
import {
  createContentStyleSnapshot,
  resolveContentStyle,
} from "../_shared/content-style.ts";
import {
  CONTENT_TYPE_INSTRUCTIONS,
} from "../_shared/content-quality.ts";
import {
  CONTENT_LENGTH_HINTS,
  DEFAULT_CONTENT_SYSTEM,
  runContentGenerationOrchestration,
  type ContentModelRequest,
} from "../_shared/content-generation-orchestration.ts";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Default base system prompt — kept in sync with the "content.generate" entry
// in lib/prompts/registry.ts so that saving the default in admin resets cleanly.
const DEFAULT_SYSTEM = DEFAULT_CONTENT_SYSTEM;

/**
 * Admin prompt override (/admin/prompts → ai_prompts table). When a row exists
 * for the slug, it replaces the built-in default — so prompt edits go live
 * without redeploying. Cached briefly per instance; any failure falls back.
 */
const promptCache = new Map<string, { content: string | null; at: number }>();
// deno-lint-ignore no-explicit-any
async function promptOverride(admin: any, slug: string, fallback: string): Promise<string> {
  const hit = promptCache.get(slug);
  if (hit && Date.now() - hit.at < 30_000) return hit.content ?? fallback;
  try {
    const { data } = await admin.from("ai_prompts").select("content").eq("slug", slug).maybeSingle();
    const content = (data?.content as string | undefined) ?? null;
    promptCache.set(slug, { content, at: Date.now() });
    return content ?? fallback;
  } catch {
    return fallback;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return null;
  const strings = value as string[];
  return new Set(strings).size === strings.length ? strings : null;
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

// A content brief may carry market inspiration, but it must reference the exact
// immutable report owned by this tenant. Direct Edge Function callers therefore
// cannot forge competitor evidence or attach another tenant's intelligence.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateMarketIntelligence(admin: any, clientId: string, value: unknown): Promise<string | null> {
  if (value === undefined || value === null) return null;
  const provenance = record(value);
  if (
    !provenance ||
    provenance.version !== 1 ||
    provenance.reportSchemaVersion !== 2 ||
    typeof provenance.runId !== "string" ||
    typeof provenance.ideaTitle !== "string" ||
    !["low", "medium", "high"].includes(String(provenance.confidence)) ||
    !["new", "adjacent", "overlap"].includes(String(provenance.novelty))
  ) return "Market intelligence provenance is malformed.";

  const competitorIds = uniqueStrings(provenance.competitorIds);
  const competitorSources = Array.isArray(provenance.competitorSources)
    ? provenance.competitorSources.map(record)
    : null;
  const companyReferences = Array.isArray(provenance.companyReferences)
    ? provenance.companyReferences.map(record)
    : null;
  if (
    !competitorIds?.length ||
    !competitorSources ||
    competitorSources.length < 2 ||
    competitorSources.some((source) => !source) ||
    !companyReferences ||
    companyReferences.some((source) => !source)
  ) return "Market intelligence provenance is incomplete.";

  const { data: report, error } = await admin
    .from("competitor_intelligence_runs")
    .select("id,client_id,schema_version,analysis,source_evidence,company_evidence")
    .eq("id", provenance.runId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return "Market intelligence provenance could not be verified.";
  if (!report || report.schema_version !== 2) return "Market intelligence report was not found.";

  const analysis = record(report.analysis);
  const ideas = Array.isArray(analysis?.recommended_ideas)
    ? analysis.recommended_ideas.map(record).filter(Boolean) as Record<string, unknown>[]
    : [];
  const idea = ideas.find((candidate) =>
    candidate.title === provenance.ideaTitle &&
    candidate.confidence === provenance.confidence &&
    candidate.novelty === provenance.novelty);
  if (!idea) return "The selected idea is not part of the verified report.";

  const ideaCompetitorIds = uniqueStrings(idea.competitor_ids);
  const ideaSourceIds = uniqueStrings(idea.source_item_ids);
  const ideaCompanyIds = uniqueStrings(idea.company_reference_ids);
  const evidenceQuotes = Array.isArray(idea.evidence_quotes)
    ? idea.evidence_quotes.map(record).filter(Boolean) as Record<string, unknown>[]
    : [];
  if (
    !ideaCompetitorIds ||
    !ideaSourceIds ||
    !ideaCompanyIds ||
    !sameStringSet(competitorIds, ideaCompetitorIds)
  ) return "The selected idea provenance does not match its report.";

  const sourceEvidence = Array.isArray(report.source_evidence)
    ? report.source_evidence.map(record).filter(Boolean) as Record<string, unknown>[]
    : [];
  const sourceById = new Map(sourceEvidence.map((source) => [String(source.item_id), source]));
  const submittedSourceIds: string[] = [];
  for (const source of competitorSources as Record<string, unknown>[]) {
    if (
      typeof source.itemId !== "string" ||
      typeof source.captureVersionId !== "string" ||
      typeof source.contentHash !== "string" ||
      typeof source.competitorId !== "string" ||
      typeof source.evidenceQuote !== "string"
    ) return "A market intelligence source is malformed.";
    const saved = sourceById.get(source.itemId);
    const quote = evidenceQuotes.find((entry) => entry.source_item_id === source.itemId);
    if (
      !saved ||
      saved.capture_version_id !== source.captureVersionId ||
      saved.content_hash !== source.contentHash ||
      saved.competitor_id !== source.competitorId ||
      quote?.quote !== source.evidenceQuote
    ) return "A market intelligence source does not match the immutable report.";
    submittedSourceIds.push(source.itemId);
  }
  if (!sameStringSet(submittedSourceIds, ideaSourceIds)) {
    return "The market intelligence source set is incomplete.";
  }

  const companyEvidence = Array.isArray(report.company_evidence)
    ? report.company_evidence.map(record).filter(Boolean) as Record<string, unknown>[]
    : [];
  const companyById = new Map(companyEvidence.map((source) => [String(source.id), source]));
  const submittedCompanyIds: string[] = [];
  for (const source of companyReferences as Record<string, unknown>[]) {
    if (
      typeof source.id !== "string" ||
      typeof source.kind !== "string" ||
      typeof source.contentHash !== "string"
    ) return "A company comparison reference is malformed.";
    const saved = companyById.get(source.id);
    if (
      !saved ||
      saved.kind !== source.kind ||
      saved.content_hash !== source.contentHash
    ) return "A company comparison reference does not match the report.";
    submittedCompanyIds.push(source.id);
  }
  if (!sameStringSet(submittedCompanyIds, ideaCompanyIds)) {
    return "The company comparison reference set is incomplete.";
  }
  return null;
}

export async function handleContentGenerateRequest(
  req: Request,
  dependencies: {
    createClient?: typeof createClient;
    fetch?: typeof fetch;
    envGet?: (key: string) => string | undefined;
  } = {},
): Promise<Response> {
  const createSupabaseClient = dependencies.createClient ?? createClient;
  const fetchImpl = dependencies.fetch ?? fetch;
  const envGet = dependencies.envGet ?? ((key: string) => Deno.env.get(key));
  const corsHeaders = {
    ...baseCorsHeaders,
    "Access-Control-Allow-Origin": envGet("ALLOWED_ORIGIN") ?? "https://rapidtal.online",
  };
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = envGet("SUPABASE_URL")!;
    const serviceKey = envGet("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = envGet("SUPABASE_ANON_KEY")!;
    const openrouterKey = envGet("OPENROUTER_API_KEY");

    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "OpenRouter not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createSupabaseClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createSupabaseClient(supabaseUrl, serviceKey);

    const { data: userRow } = await admin
      .from("users")
      .select("id, role, client_id")
      .eq("id", authUser.id)
      .single();

    if (!userRow) {
      return new Response(JSON.stringify({ error: "User record not found." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const body = await req.json();
    const { clientId, contentType: requestedContentType, title } = body;
    // Compatibility for an older web deployment that used a combined "social"
    // format. It still produces exactly one artifact while clients migrate to
    // an explicit platform.
    const contentType = requestedContentType === "social" ? "linkedin" : requestedContentType;
    const persist = body.persist !== false;
    const sourceContext = typeof body.sourceContext === "string" ? body.sourceContext : "";
    const requestedGenerationKind = body.generationKind;
    const parentPieceId = typeof body.parentPieceId === "string" ? body.parentPieceId : null;
    const rawBrief = body.brief;
    const structuredBrief =
      rawBrief && typeof rawBrief === "object" && !Array.isArray(rawBrief)
        ? rawBrief as Record<string, unknown>
        : {
            version: 1,
            objective: typeof rawBrief === "string" ? rawBrief : "",
            tone: body.tone ?? "professional",
            length: body.length ?? "medium",
          };
    const objective = typeof structuredBrief.objective === "string"
      ? structuredBrief.objective.trim()
      : "";
    const tone = typeof structuredBrief.tone === "string"
      ? structuredBrief.tone.toLowerCase()
      : "professional";
    const length = typeof structuredBrief.length === "string"
      ? structuredBrief.length
      : "medium";
    const contentBrief: Record<string, unknown> = {
      ...structuredBrief,
      version: 1,
      objective,
      tone,
      length,
    };

    if (
      typeof clientId !== "string" ||
      typeof contentType !== "string" ||
      typeof title !== "string" ||
      !clientId ||
      !contentType ||
      !title.trim() ||
      !objective
    ) {
      return new Response(JSON.stringify({ error: "Missing required fields: clientId, contentType, title, brief." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      title.length > 300 ||
      JSON.stringify(contentBrief).length > 48000 ||
      sourceContext.length > 50000
    ) {
      return new Response(JSON.stringify({ error: "The content request is too long." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (
      typeof tone !== "string" ||
      !["professional", "friendly", "persuasive", "casual", "authoritative", "warm", "direct", "playful"].includes(tone) ||
      !["short", "medium", "long"].includes(length)
    ) {
      return new Response(JSON.stringify({ error: "Invalid tone or length." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["email", "x", "linkedin", "facebook", "instagram", "newsletter", "blog", "message", "other"];
    if (!validTypes.includes(contentType)) {
      return new Response(JSON.stringify({ error: `Invalid contentType. Must be one of: ${validTypes.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Client access ─────────────────────────────────────────────────────────
    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;
    if (role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const marketIntelligenceError = await validateMarketIntelligence(
      admin,
      clientId,
      contentBrief.marketIntelligence,
    );
    if (marketIntelligenceError) {
      return new Response(JSON.stringify({ error: marketIntelligenceError }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let generationKind = contentBrief.mode === "reply" ? "reply" : "original";
    if (requestedGenerationKind === "adaptation") {
      if (!parentPieceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parentPieceId)) {
        return new Response(JSON.stringify({ error: "A valid parent piece is required for adaptation." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: parent, error: parentError } = await admin
        .from("content_pieces")
        .select("id")
        .eq("id", parentPieceId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (parentError) {
        return new Response(JSON.stringify({ error: "Content lineage is temporarily unavailable." }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!parent) {
        return new Response(JSON.stringify({ error: "Source content was not found." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      generationKind = "adaptation";
    }

    // ── Fetch context: DNA + category-relevant vault items ──────────────────────
    // Content type determines which vault categories are most relevant:
    // - email/social/newsletter/ad: service and general items (brand voice, offerings)
    // - blog/article: reference and process items (depth, expertise)
    // - sop/procedure: process and policy items (workflows, rules)
    const CATEGORY_RELEVANCE: Record<string, string[]> = {
      email:      ["service", "general", "policy", "contact"],
      x:          ["service", "reference", "general"],
      linkedin:   ["service", "reference", "process", "general"],
      facebook:   ["service", "general", "reference"],
      instagram:  ["service", "general", "reference"],
      message:    ["service", "general", "policy", "contact"],
      other:      ["service", "general", "reference", "policy"],
      newsletter: ["service", "general", "reference", "process"],
      ad:         ["service", "general"],
      blog:       ["reference", "process", "service", "general"],
      article:    ["reference", "process", "policy", "general"],
      sop:        ["process", "policy", "reference", "general"],
      procedure:  ["process", "policy", "service"],
    };
    const relevantCats = CATEGORY_RELEVANCE[contentType as string] ?? ["service", "general", "reference", "process"];

    const { data: dna, error: dnaError } = await admin
      .from("company_dna")
      .select("company_name,company_description,values,services,target_demographic,location,address,website,social_links,business_goals,marketing_goals,team,tools_used,content_style,brand_voice,internal_rules,sign_off,preferred_terms,prohibited_terms,emoji_policy,humour_policy,spelling_locale,default_cta_style,approved_claims,prohibited_claims,channel_styles,hard_rules,extra,updated_at")
      .eq("client_id", clientId)
      .maybeSingle();
    if (dnaError) {
      console.error("content-generate: Company DNA query failed:", dnaError);
      return new Response(JSON.stringify({ error: "Company DNA is temporarily unavailable. No draft was created." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dna) {
      return new Response(JSON.stringify({ error: "Complete Company DNA before generating content." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: approvedStyleAnalysis, error: styleAnalysisError } = await admin
      .from("content_style_analyses")
      .select("id,channel,analysis,source_item_ids,analysed_at,approved_at")
      .eq("client_id", clientId)
      .eq("channel", contentType)
      .eq("status", "approved")
      .maybeSingle();
    if (styleAnalysisError) {
      console.error("content-generate: approved style analysis query failed:", styleAnalysisError);
      return new Response(JSON.stringify({ error: "Approved writing style is temporarily unavailable. No draft was created." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resolvedDna: Record<string, unknown> = {
      ...(dna as Record<string, unknown>),
      style_analysis_profiles: approvedStyleAnalysis
        ? { [contentType]: approvedStyleAnalysis }
        : {},
    };
    let retrieval;
    try {
      retrieval = await retrieveContentVault({
        admin,
        clientId,
        query: `${title}. ${objective}. ${String(contentBrief.additionalGuidance ?? "")}`,
        relevantCategories: relevantCats,
        styleChannel: contentType,
      });
    } catch (error) {
      console.error("content-generate: Vault query failed:", error);
      return new Response(JSON.stringify({ error: "Vault context is temporarily unavailable. No draft was created." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let context = "";
    const d = resolvedDna;
    context += "=== COMPANY CONTEXT ===\n";
    for (const [k, v] of Object.entries(d)) {
      if (k !== "updated_at" && v && typeof v === "string") context += `${k}: ${v}\n`;
    }
    if (d.extra && typeof d.extra === "object" && !Array.isArray(d.extra)) {
      context += `additional company details: ${JSON.stringify(d.extra).slice(0, 4000)}\n`;
    }
    if (d.social_links && typeof d.social_links === "object" && !Array.isArray(d.social_links)) {
      context += `official social channels: ${JSON.stringify(d.social_links).slice(0, 2000)}\n`;
    }
    context += "\n";
    if (retrieval.context) context += `${retrieval.context}\n`;

    // Brain memory — learned preferences & rules the draft must honour.
    const { data: memRows, error: memoryError } = await admin.from("brain_memory")
      .select("kind, content, scope").eq("client_id", clientId).eq("active", true)
      .order("pinned", { ascending: false }).limit(60);
    if (memoryError) {
      console.error("content-generate: Brain memory query failed:", memoryError);
      return new Response(JSON.stringify({ error: "Company style memory is temporarily unavailable. No draft was created." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mem = ((memRows ?? []) as {
      kind: string;
      content: string;
      scope: { surfaces?: string[] } | null;
    }[])
      .filter((memory) => memoryAppliesToSurfaces(memory.scope, ["content", contentType]))
      .slice(0, 20);
    if (mem.length) {
      const memLabel: Record<string, string> = { preference: "Prefer", anti_pattern: "Avoid", rule: "Rule" };
      context += "=== COMPANY PREFERENCES & RULES (learned — follow these) ===\n";
      for (const m of mem) context += `${memLabel[m.kind] ?? "Note"}: ${m.content}\n`;
      context += "\n";
    }

    // ── OpenAI generation ─────────────────────────────────────────────────────
    const style = resolveContentStyle(
      resolvedDna,
      contentType,
      tone,
      CONTENT_LENGTH_HINTS[length] ?? "",
    );
    const baseTemplate = await promptOverride(admin, "content.generate", DEFAULT_SYSTEM);
    const complete = async (request: ContentModelRequest): Promise<string> => {
      const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openrouterKey}` },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          max_tokens: request.maxTokens,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          ...(request.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(`OpenAI failed: ${json?.error?.message ?? "Unknown"}`);
      }
      return json.choices?.[0]?.message?.content ?? "";
    };

    const marketIntelligence = record(contentBrief.marketIntelligence);
    const modelContentBrief = marketIntelligence
      ? {
          ...contentBrief,
          marketIntelligence: {
            ideaTitle: marketIntelligence.ideaTitle,
            confidence: marketIntelligence.confidence,
            novelty: marketIntelligence.novelty,
            competitorSourceCount: Array.isArray(marketIntelligence.competitorSources)
              ? marketIntelligence.competitorSources.length
              : 0,
            companyReferenceCount: Array.isArray(marketIntelligence.companyReferences)
              ? marketIntelligence.companyReferences.length
              : 0,
            instruction: "Market intelligence is inspiration only. Company facts must come from the Vault context.",
          },
        }
      : contentBrief;

    console.log(`✍️ Generating ${contentType} content...`);
    const {
      finalBody,
      critique,
      verifiedSources,
      qualityWarnings,
    } = await runContentGenerationOrchestration({
      contentType: contentType as keyof typeof CONTENT_TYPE_INSTRUCTIONS,
      title,
      contentBrief: modelContentBrief,
      context,
      sourceContext,
      style,
      dna: resolvedDna,
      sources: retrieval.sources,
      complete,
      baseTemplate,
    });
    const styleSnapshot = {
      ...createContentStyleSnapshot(
      style,
      contentType,
      typeof resolvedDna.updated_at === "string"
        ? resolvedDna.updated_at as string
        : null,
      ),
      exampleSources: retrieval.styleSources,
    };
    if (qualityWarnings.length) {
      return new Response(JSON.stringify({
        error: "The generated draft did not pass the content quality gate. No draft was created.",
        warnings: qualityWarnings,
        critique,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pieceId: string | null = null;
    let persistedPiece: Record<string, unknown> | null = null;
    if (persist) {
      const { data: piece, error: dbError } = await admin
        .from("content_pieces")
        .insert({
          client_id: clientId,
          content_type: contentType,
          title,
          brief: objective,
          content_brief: contentBrief,
          source_references: verifiedSources,
          body: finalBody,
          status: "draft",
          created_by: authUser.id,
          style_snapshot: styleSnapshot,
          generation_kind: generationKind,
          parent_piece_id: generationKind === "adaptation" ? parentPieceId : null,
        })
        .select("id,content_type,title,status,generation_kind,parent_piece_id,created_at,updated_at")
        .single();

      if (dbError) {
        return new Response(JSON.stringify({ error: dbError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      pieceId = (piece as { id: string }).id;
      persistedPiece = piece as Record<string, unknown>;
      console.log(`✅ Content saved: ${pieceId}`);
    }

    return new Response(JSON.stringify({
      success: true,
      id: pieceId,
      piece: persistedPiece,
      updatedAt: typeof persistedPiece?.updated_at === "string" ? persistedPiece.updated_at : null,
      body: finalBody,
      critique,
      appliedStyle: style.summary,
      styleSnapshot,
      sources: verifiedSources,
      contextSources: retrieval.sources,
      styleSources: retrieval.styleSources,
      contentType,
      warnings: qualityWarnings,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ content-generate error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleContentGenerateRequest(request));
}
