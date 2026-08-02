import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess, requireApiAuth } from "@/lib/api-auth";
import { originRejected } from "@/lib/api/csrf";
import { serverError } from "@/lib/api/errors";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankEvidenceCandidates } from "@/lib/content/evidence-ranking";
import { loadProjectStyleSnapshot } from "@/lib/content/project-style";
import { recordWorkflowEvent, type PilotDbClient } from "@/lib/content/pilot-observability";
import type { ContentBrief, ContentProjectIdea } from "@/types/content";

interface QuickEvidenceCandidate {
  id: string;
  title: string;
  category: string | null;
  ai_summary: string | null;
  raw_content: string | null;
  source_url: string | null;
}

export const runtime = "nodejs";

const schema = z.object({
  clientId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  contentType: z.enum(["linkedin", "facebook", "instagram", "x", "email", "newsletter", "blog"]),
  guidance: z.string().trim().max(2000).optional().nullable(),
});

const projectColumns = "id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,brain_context_snapshot_id,quick_create_request_hash,created_at,updated_at";
const pieceColumns = "id,project_id,content_type,title,brief,body,status,content_brief,source_references,style_snapshot,parent_piece_id,generation_kind,created_at,updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadResult(db: any, clientId: string, projectId: string) {
  const { data: project, error } = await db.from("content_projects")
    .select(projectColumns).eq("id", projectId).eq("client_id", clientId).maybeSingle();
  if (error) throw error;
  if (!project) return null;
  let piece = null;
  if (project.current_piece_id) {
    const result = await db.from("content_pieces").select(pieceColumns)
      .eq("id", project.current_piece_id).eq("client_id", clientId).maybeSingle();
    if (result.error) throw result.error;
    piece = result.data;
  }
  return { project: { ...project, current_piece: piece }, piece };
}

export async function POST(req: NextRequest) {
  if (originRejected(req)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  const auth = await requireApiAuth();
  if ("error" in auth) return auth.error;
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Add a valid topic and channel." }, { status: 422 });
  const input = parsed.data;
  const denied = assertClientAccess(auth.user, input.clientId);
  if (denied) return denied;
  const requestHash = createHash("sha256").update(JSON.stringify({
    clientId: input.clientId,
    title: input.title,
    contentType: input.contentType,
    guidance: input.guidance || null,
  })).digest("hex");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration follows generated schema snapshot
  const db = createAdminClient() as any;
  const { data: existing, error: existingError } = await db.from("content_projects")
    .select(projectColumns).eq("client_id", input.clientId).eq("created_by", auth.user.id)
    .eq("quick_create_key", input.idempotencyKey).maybeSingle();
  if (existingError) return serverError(existingError);
  if (existing && existing.quick_create_request_hash !== requestHash) {
    return NextResponse.json({ error: "This retry belongs to a different Quick Create request." }, { status: 409 });
  }
  if (existing?.current_piece_id && ["edit", "validate", "approve", "complete"].includes(existing.current_step)) {
    try {
      const result = await loadResult(db, input.clientId, existing.id);
      if (result?.piece) return NextResponse.json({ ...result, recovered: true });
    } catch (error) { return serverError(error); }
  }
  if (existing && existing.current_step !== "generate") {
    return NextResponse.json({
      error: "This Quick Create request is already in another workflow state.",
      projectId: existing.id,
      recoverable: true,
    }, { status: 409 });
  }

  const idea: ContentProjectIdea = {
    version: 1,
    origin: "manual",
    title: input.title,
    channel: input.contentType,
    rationale: "A direct content request from the editorial team.",
    differentiation: "Use Company DNA, approved voice and the most relevant company evidence.",
    evidenceSummary: "The engine automatically shortlisted relevant factual Vault sources.",
    marketIntelligence: null,
  };
  const brief: ContentBrief = {
    version: 1,
    objective: input.title,
    audience: null,
    angle: null,
    desiredFormat: null,
    keyPoints: [],
    callToAction: null,
    tone: "professional",
    length: "medium",
    mode: "new",
    additionalGuidance: input.guidance || null,
    marketIntelligence: null,
  };
  let project = existing;
  if (!project) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: candidates, error: candidatesError } = await db.from("vault_items")
      .select("id,title,category,ai_summary,raw_content,source_url")
      .eq("client_id", input.clientId).eq("status", "ready").eq("evidence_role", "factual")
      .eq("knowledge_status", "active").eq("has_conflict", false)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${today}`)
      .order("updated_at", { ascending: false }).limit(60);
    if (candidatesError) return serverError(candidatesError);
    const selected = rankEvidenceCandidates(
      `${input.title} ${input.guidance ?? ""}`,
      (candidates ?? []) as QuickEvidenceCandidate[],
    ).slice(0, 6);
    const sourceIds = selected.map((source) => source.id);
    const sourceReferences = selected.map((source) => ({
      itemId: source.id,
      title: source.title,
      kind: "vault_item",
      excerpt: (source.ai_summary || source.raw_content || "").slice(0, 700),
      similarity: null,
    }));
    let styleSnapshot;
    try {
      styleSnapshot = await loadProjectStyleSnapshot(db, input.clientId, input.contentType, brief);
    } catch (error) { return serverError(error); }
    const prepared = await db.rpc("prepare_quick_content_project", {
      p_client_id: input.clientId,
      p_actor_id: auth.user.id,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: requestHash,
      p_title: input.title,
      p_idea: idea,
      p_content_brief: brief,
      p_vault_source_ids: sourceIds,
      p_vault_source_references: sourceReferences,
      p_style_snapshot: styleSnapshot,
    }).single();
    if (prepared.error) return serverError(prepared.error);
    project = prepared.data;
    await recordWorkflowEvent(db as PilotDbClient, {
      clientId: input.clientId,
      projectId: project.id,
      actorId: auth.user.id,
      eventType: "idea_promoted",
      stage: "idea",
      metadata: { origin: "quick_create", channel: input.contentType },
    });
  }

  const rl = await aiGenerateLimiter.check(`content:${auth.user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);
  const generated = await proxyToEdgeFunction("content-generate", {
    clientId: input.clientId,
    projectId: project.id,
    vaultSourceIds: project.vault_source_ids,
    contentType: input.contentType,
    title: input.title,
    brief,
  });
  const generatedBody = await generated.json().catch(() => ({})) as Record<string, unknown>;
  if (!generated.ok) {
    await db.from("content_projects").update({
      last_operation: "quick_draft",
      last_error_code: typeof generatedBody.code === "string" ? generatedBody.code : `HTTP_${generated.status}`,
      last_error_message: typeof generatedBody.error === "string" ? generatedBody.error : "The draft could not be generated.",
      last_error_at: new Date().toISOString(),
    }).eq("id", project.id).eq("client_id", input.clientId);
    return NextResponse.json({
      ...generatedBody,
      error: typeof generatedBody.error === "string" ? generatedBody.error : "The draft could not be generated.",
      projectId: project.id,
      recoverable: true,
    }, { status: generated.status });
  }

  try {
    const result = await loadResult(db, input.clientId, project.id);
    if (!result?.piece) return NextResponse.json({
      error: "The provider completed but the saved draft is not available yet.",
      projectId: project.id,
      recoverable: true,
    }, { status: 503 });
    await db.from("content_projects").update({
      last_operation: null,
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
      last_generation_warnings: Array.isArray(generatedBody.warnings) ? generatedBody.warnings : [],
    }).eq("id", project.id).eq("client_id", input.clientId);
    return NextResponse.json({ ...result, warnings: generatedBody.warnings ?? [] });
  } catch (error) { return serverError(error); }
}
