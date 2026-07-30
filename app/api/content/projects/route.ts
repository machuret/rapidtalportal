import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import {
  contentBriefSchema,
  contentMarketIntelligenceSchema,
  contentProjectIdeaSchema,
  contentProjectStatusSchema,
  contentProjectStepSchema,
} from "@/lib/content/project-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordWorkflowEvent,
  type PilotDbClient,
} from "@/lib/content/pilot-observability";
import {
  createContentStyleSnapshot,
  resolveContentStyle,
} from "@/supabase/functions/_shared/content-style";

type MarketIntelligence = z.infer<typeof contentMarketIntelligenceSchema>;

function completeEditorialBrief(
  brief: z.infer<typeof contentBriefSchema> | undefined,
): boolean {
  // The objective is the only information generation genuinely needs.
  // Audience, angle, format and CTA are useful steering controls, not gates:
  // the engine can resolve them from the idea, Company DNA and channel rules.
  return !!brief?.objective.trim();
}

function sameSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === left.length &&
    rightSet.size === right.length &&
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}

async function verifyMarketIntelligence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  clientId: string,
  provenance: MarketIntelligence,
): Promise<string | null> {
  const { data: report, error } = await db
    .from("competitor_intelligence_runs")
    .select("id,schema_version,analysis,source_evidence,company_evidence")
    .eq("id", provenance.runId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return "Market intelligence provenance could not be verified.";
  if (!report || report.schema_version !== 2) return "Market intelligence report was not found.";

  const analysis = report.analysis && typeof report.analysis === "object" && !Array.isArray(report.analysis)
    ? report.analysis as Record<string, unknown>
    : {};
  const ideas = Array.isArray(analysis.recommended_ideas)
    ? analysis.recommended_ideas.filter(
        (item: unknown): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  const idea = ideas.find((candidate) =>
    candidate.title === provenance.ideaTitle &&
    candidate.why_valuable === provenance.whyValuable &&
    candidate.differentiation === provenance.differentiation &&
    candidate.confidence === provenance.confidence &&
    candidate.novelty === provenance.novelty
  );
  if (!idea) return "The selected idea is not part of the verified report.";
  const reportSourceIds = Array.isArray(idea.source_item_ids)
    ? idea.source_item_ids.filter((value): value is string => typeof value === "string")
    : [];
  const reportCompanyIds = Array.isArray(idea.company_reference_ids)
    ? idea.company_reference_ids.filter((value): value is string => typeof value === "string")
    : [];
  const reportCompetitorIds = Array.isArray(idea.competitor_ids)
    ? idea.competitor_ids.filter((value): value is string => typeof value === "string")
    : [];
  if (!sameSet(provenance.competitorIds, reportCompetitorIds)) {
    return "The selected competitor set does not match its report.";
  }

  const quotes = new Map(
    (Array.isArray(idea.evidence_quotes) ? idea.evidence_quotes : [])
      .flatMap((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const row = value as Record<string, unknown>;
        return typeof row.source_item_id === "string" && typeof row.quote === "string"
          ? [[row.source_item_id, row.quote] as const]
          : [];
      }),
  );
  const sourceById = new Map<string, Record<string, unknown>>(
    (Array.isArray(report.source_evidence) ? report.source_evidence : [])
      .flatMap((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const row = value as Record<string, unknown>;
        return typeof row.item_id === "string" ? [[row.item_id, row] as const] : [];
      }),
  );
  for (const source of provenance.competitorSources) {
    const saved = sourceById.get(source.itemId);
    if (
      !saved ||
      saved.capture_version_id !== source.captureVersionId ||
      saved.content_hash !== source.contentHash ||
      saved.competitor_id !== source.competitorId ||
      quotes.get(source.itemId) !== source.evidenceQuote
    ) {
      return "A competitor signal does not match the immutable report.";
    }
  }
  if (!sameSet(provenance.competitorSources.map((source) => source.itemId), reportSourceIds)) {
    return "The competitor signal set is incomplete.";
  }

  const companyById = new Map<string, Record<string, unknown>>(
    (Array.isArray(report.company_evidence) ? report.company_evidence : [])
      .flatMap((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const row = value as Record<string, unknown>;
        return typeof row.id === "string" ? [[row.id, row] as const] : [];
      }),
  );
  for (const source of provenance.companyReferences) {
    const saved = companyById.get(source.id);
    if (!saved || saved.kind !== source.kind || saved.content_hash !== source.contentHash) {
      return "A company comparison does not match the immutable report.";
    }
  }
  return sameSet(provenance.companyReferences.map((source) => source.id), reportCompanyIds)
    ? null
    : "The company comparison set is incomplete.";
}

const querySchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid().optional(),
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  idea: contentProjectIdeaSchema,
});

const updateSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  expected_updated_at: z.string().datetime({ offset: true }),
  current_step: contentProjectStepSchema.optional(),
  status: contentProjectStatusSchema.optional(),
  content_brief: contentBriefSchema.optional(),
  vault_source_ids: z.array(z.string().uuid()).max(20).optional(),
}).refine(
  (value) =>
    value.current_step !== undefined ||
    value.status !== undefined ||
    value.content_brief !== undefined ||
    value.vault_source_ids !== undefined,
  { message: "No project update was supplied." },
);

async function loadProjectStyleSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  clientId: string,
  channel: string,
  brief: z.infer<typeof contentBriefSchema>,
) {
  const [
    { data: dna, error: dnaError },
    { data: styleProfile, error: styleError },
  ] = await Promise.all([
    db
      .from("company_dna")
      .select("updated_at,internal_rules,brand_voice,content_style,sign_off,preferred_terms,prohibited_terms,emoji_policy,humour_policy,spelling_locale,default_cta_style,approved_claims,prohibited_claims,channel_styles,hard_rules")
      .eq("client_id", clientId)
      .maybeSingle(),
    db
      .from("content_style_analyses")
      .select("id,channel,analysis,source_item_ids,source_evidence,analysed_at,approved_at")
      .eq("client_id", clientId)
      .eq("channel", channel)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  if (dnaError) throw dnaError;
  if (styleError) throw styleError;
  const resolvedDna = {
    ...(dna ?? {}),
    style_analysis_profiles: styleProfile ? { [channel]: styleProfile } : {},
  };
  const style = resolveContentStyle(
    resolvedDna,
    channel,
    brief.tone,
    brief.length === "short"
      ? "Keep it brief and punchy."
      : brief.length === "long"
        ? "Be comprehensive and detailed."
        : "Use a standard length for the format.",
  );
  return createContentStyleSnapshot(
    style,
    channel,
    typeof dna?.updated_at === "string" ? dna.updated_at : null,
  );
}

export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    client_id: searchParams.get("client_id"),
    id: searchParams.get("id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project query." }, { status: 400 });
  }
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const db = createAdminClient();
  const columns = "id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,created_at,updated_at";
  if (!parsed.data.id) {
    const { data, error } = await db
      .from("content_projects")
      .select(columns)
      .eq("client_id", parsed.data.client_id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return serverError(error);
    return NextResponse.json(data ?? []);
  }

  const { data: project, error } = await db
    .from("content_projects")
    .select(columns)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .maybeSingle();
  if (error) return serverError(error);
  if (!project) return NextResponse.json({ error: "Content project not found." }, { status: 404 });

  let currentPiece = null;
  if (project.current_piece_id) {
    const { data: piece, error: pieceError } = await db
      .from("content_pieces")
      .select("id,project_id,content_type,title,brief,body,status,content_brief,source_references,style_snapshot,parent_piece_id,generation_kind,created_at,updated_at")
      .eq("id", project.current_piece_id)
      .eq("client_id", parsed.data.client_id)
      .maybeSingle();
    if (pieceError) return serverError(pieceError);
    currentPiece = piece;
  }
  const { data: pieces, error: piecesError } = await db
    .from("content_pieces")
    .select("id,project_id,content_type,title,status,generation_kind,parent_piece_id,created_at")
    .eq("project_id", project.id)
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (piecesError) return serverError(piecesError);
  return NextResponse.json({ ...project, current_piece: currentPiece, pieces: pieces ?? [] });
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const market = parsed.data.idea.marketIntelligence;
  const db = createAdminClient();
  if (market) {
    const marketError = await verifyMarketIntelligence(db, parsed.data.client_id, market);
    if (marketError) return NextResponse.json({ error: marketError }, { status: 422 });
  }
  // The validated Zod object contains nested JSON that the generated Supabase
  // type cannot narrow to its recursive Json alias.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("content_projects")
    .insert({
      client_id: parsed.data.client_id,
      title: parsed.data.idea.title,
      status: "active",
      current_step: "idea",
      idea_snapshot: parsed.data.idea,
      competitor_signals: market?.competitorSources ?? [],
      created_by: user.id,
    })
    .select("id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,created_at,updated_at")
    .single();
  if (error) return serverError(error);
  await recordWorkflowEvent(db as unknown as PilotDbClient, {
    clientId: parsed.data.client_id,
    projectId: data.id,
    actorId: user.id,
    eventType: "idea_promoted",
    stage: "idea",
    metadata: { origin: parsed.data.idea.origin, channel: parsed.data.idea.channel },
  });
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  if (parsed.data.status && ["approved", "archived"].includes(parsed.data.status)) {
    return NextResponse.json({
      error: "Approve or archive the connected draft so the project and artifact stay consistent.",
    }, { status: 422 });
  }

  const db = createAdminClient();
  const { data: current, error: currentError } = await db
    .from("content_projects")
    .select("id,status,current_step,idea_snapshot,content_brief,current_piece_id")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .maybeSingle();
  if (currentError) return serverError(currentError);
  if (!current) return NextResponse.json({ error: "Content project not found." }, { status: 404 });
  if (["rejected", "approved", "archived"].includes(current.status)) {
    return NextResponse.json({ error: "This completed project cannot be changed." }, { status: 422 });
  }
  if (parsed.data.current_step === "complete" && parsed.data.status !== "rejected") {
    return NextResponse.json({
      error: "A project is completed only by rejecting the idea or approving its connected draft.",
    }, { status: 422 });
  }
  const resolvedBrief = parsed.data.content_brief ?? contentBriefSchema.safeParse(current.content_brief).data;
  if (
    parsed.data.current_step &&
    ["evidence", "generate", "edit", "validate", "approve"].includes(parsed.data.current_step) &&
    !completeEditorialBrief(resolvedBrief)
  ) {
    return NextResponse.json({
      error: "Add a short objective before continuing. Every other brief field is optional.",
    }, { status: 422 });
  }
  if (
    parsed.data.current_step &&
    ["edit", "validate", "approve"].includes(parsed.data.current_step) &&
    !current.current_piece_id
  ) {
    return NextResponse.json({ error: "Generate the connected draft before continuing." }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.current_step) updates.current_step = parsed.data.current_step;
  if (parsed.data.status) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "rejected") updates.current_step = "complete";
  }

  if (parsed.data.content_brief) {
    const idea = contentProjectIdeaSchema.parse(current.idea_snapshot);
    const contentBrief = {
      ...parsed.data.content_brief,
      marketIntelligence: idea.marketIntelligence ?? null,
    };
    updates.content_brief = contentBrief;
    updates.style_snapshot = await loadProjectStyleSnapshot(
      db,
      parsed.data.client_id,
      idea.channel,
      contentBrief,
    );
  }

  if (parsed.data.vault_source_ids) {
    let selectedReferences: Array<Record<string, unknown>> = [];
    if (parsed.data.vault_source_ids.length) {
      const { data: selected, error: selectedError } = await db
        .from("vault_items")
        .select("id,title,ai_summary,raw_content")
        .eq("client_id", parsed.data.client_id)
        .eq("status", "ready")
        .eq("evidence_role", "factual")
        .in("id", parsed.data.vault_source_ids);
      if (selectedError) return serverError(selectedError);
      if ((selected ?? []).length !== parsed.data.vault_source_ids.length) {
        return NextResponse.json({
          error: "One or more selected sources are not factual Vault material for this company.",
        }, { status: 422 });
      }
      const byId = new Map((selected ?? []).map((item) => [item.id, item]));
      selectedReferences = parsed.data.vault_source_ids.map((id) => {
        const item = byId.get(id)!;
        const excerpt = item.ai_summary || item.raw_content || "";
        return {
          itemId: item.id,
          title: item.title,
          kind: "vault_item",
          excerpt: excerpt.slice(0, 700),
          similarity: null,
        };
      });
    }
    updates.vault_source_ids = parsed.data.vault_source_ids;
    updates.vault_source_references = selectedReferences;
  }

  // Dynamic update shape is validated above; Supabase's generated type cannot
  // express this discriminated partial without collapsing JSON fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("content_projects")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .eq("updated_at", parsed.data.expected_updated_at)
    .select("id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,created_at,updated_at")
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) {
    return NextResponse.json({
      error: "This project changed in another tab. Reload it before continuing.",
    }, { status: 409 });
  }
  if (
    parsed.data.current_step === "evidence" &&
    completeEditorialBrief(resolvedBrief)
  ) {
    await recordWorkflowEvent(db as unknown as PilotDbClient, {
      clientId: parsed.data.client_id,
      projectId: parsed.data.id,
      actorId: user.id,
      eventType: "brief_completed",
      stage: "brief",
    });
  }
  return NextResponse.json(data);
});
