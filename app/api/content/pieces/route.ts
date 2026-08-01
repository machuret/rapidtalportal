import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import {
  recordWorkflowEvent,
  type PilotDbClient,
} from "@/lib/content/pilot-observability";
import {
  createContentStyleSnapshot,
  resolveContentStyle,
} from "@/supabase/functions/_shared/content-style";
import {
  claimSupportFromDna,
  contentQualityWarnings,
} from "@/supabase/functions/_shared/content-quality";
import { recordEditorialRevision } from "@/lib/brain/editorial-events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function approvedStyleProfile(db: any, clientId: string, channel: string) {
  return db
    .from("content_style_analyses")
    .select("id,channel,analysis,source_item_ids,source_evidence,analysed_at,approved_at")
    .eq("client_id", clientId)
    .eq("channel", channel)
    .eq("status", "approved")
    .maybeSingle();
}

const querySchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const updateSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["draft", "approved", "archived"]).optional(),
  title: z.string().min(1).max(300).optional(),
  body: z.string().max(50000).optional().nullable(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  content_type: z.enum([
    "email",
    "x",
    "linkedin",
    "facebook",
    "instagram",
    "social",
    "newsletter",
    "blog",
    "message",
    "other",
  ]).optional().default("other"),
  title: z.string().min(1).max(300),
  brief: z.string().max(2000).optional().nullable(),
  body: z.string().max(50000).optional().nullable(),
});

// POST /api/content/pieces — create a draft piece (e.g. promoted from Compose)
export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // Capture the current style authority even for drafts promoted from Compose.
  // Missing DNA is allowed at draft time, but a database failure is not.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [
    { data: dna, error: dnaError },
    { data: styleProfile, error: styleProfileError },
  ] = await Promise.all([
    db
      .from("company_dna")
      .select("updated_at,internal_rules,brand_voice,content_style,sign_off,preferred_terms,prohibited_terms,emoji_policy,humour_policy,spelling_locale,default_cta_style,approved_claims,prohibited_claims,channel_styles,hard_rules")
      .eq("client_id", parsed.data.client_id)
      .maybeSingle(),
    approvedStyleProfile(db, parsed.data.client_id, parsed.data.content_type),
  ]);
  if (dnaError) return serverError(dnaError);
  if (styleProfileError) return serverError(styleProfileError);
  const resolvedDna = {
    ...(dna ?? {}),
    style_analysis_profiles: styleProfile ? { [parsed.data.content_type]: styleProfile } : {},
  };
  const style = resolveContentStyle(resolvedDna, parsed.data.content_type, "Company-approved tone", "");
  const styleSnapshot = createContentStyleSnapshot(
    style,
    parsed.data.content_type,
    typeof dna?.updated_at === "string" ? dna.updated_at : null,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_pieces")
    .insert({
      client_id: parsed.data.client_id,
      content_type: parsed.data.content_type,
      title: parsed.data.title.trim(),
      brief: parsed.data.brief ?? null,
      body: parsed.data.body ?? null,
      status: "draft",
      created_by: user.id,
      style_snapshot: styleSnapshot,
    })
    .select("id, content_type, title, status, created_at")
    .single();

  if (error) {
    console.error("[content/pieces POST]", error.code, error.message);
    return serverError(error);
  }
  return NextResponse.json(data, { status: 201 });
});

// GET /api/content/pieces?client_id=xxx           → list
// GET /api/content/pieces?client_id=xxx&id=yyy    → single (includes body)
export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  const id = searchParams.get("id") ?? undefined;
  const paged = searchParams.has("offset") || searchParams.has("limit");

  const parsed = querySchema.safeParse({
    client_id: clientId,
    id,
    offset: searchParams.get("offset") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();

  if (parsed.data.id) {
    // Single piece with full body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("content_pieces")
      .select("id, client_id, project_id, content_type, title, brief, body, status, content_brief, source_references, style_snapshot, parent_piece_id, generation_kind, created_by, created_at, updated_at")
      .eq("id", parsed.data.id)
      .eq("client_id", parsed.data.client_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Content piece not found." }, { status: 404 });
      }
      return serverError(error);
    }
    return NextResponse.json(data);
  }

  // List (no body for performance)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_pieces")
    .select("id, project_id, content_type, title, status, generation_kind, parent_piece_id, created_at")
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit);

  if (error) {
    console.error("[content/pieces GET list]", error.code, error.message);
    return serverError(error);
  }

  const rows = data ?? [];
  if (!paged) return NextResponse.json(rows.slice(0, parsed.data.limit));
  const items = rows.slice(0, parsed.data.limit);
  const hasMore = rows.length > parsed.data.limit;
  return NextResponse.json({
    items,
    hasMore,
    nextOffset: hasMore ? parsed.data.offset + items.length : null,
  });
});

// PATCH /api/content/pieces — update status, title, or body
export const PATCH = withAuth(async (req, { user }) => {
  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  const admin = createAdminClient();

  // VAs can edit draft copy, but approval, archival and restoration are lifecycle
  // decisions reserved for the tenant's content approvers.
  if (parsed.data.status !== undefined && !hasContentCapability(user.role, "approve_content")) {
    return NextResponse.json({ error: "Not allowed to change the content lifecycle." }, { status: 403 });
  }

  // Read the exact version that will be passed to the atomic updater. It locks and
  // compares updated_at before committing, so validation can never approve a stale
  // body after another tab has edited it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: currentError } = await (admin as any)
    .from("content_pieces")
    .select("project_id, content_type, title, body, status, updated_at, source_references, style_snapshot, content_brief")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (currentError) return serverError(currentError);

  let dnaUpdatedAt: string | null = null;
  let styleSnapshot: Record<string, unknown> | null = null;

  // Prohibited terms, claims and explicit no-emoji policies are deterministic
  // approval gates. Natural-language style guidance remains visibly model-enforced.
  if (parsed.data.status === "approved") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const [
      { data: dna, error: dnaError },
      { data: styleProfile, error: styleProfileError },
    ] = await Promise.all([
      db
        .from("company_dna")
        .select("company_name,company_description,values,services,target_demographic,location,address,website,social_links,business_goals,marketing_goals,team,tools_used,extra,updated_at,internal_rules,brand_voice,content_style,sign_off,preferred_terms,prohibited_terms,emoji_policy,humour_policy,spelling_locale,default_cta_style,approved_claims,prohibited_claims,channel_styles,hard_rules")
        .eq("client_id", parsed.data.client_id)
        .maybeSingle(),
      approvedStyleProfile(db, parsed.data.client_id, current.content_type),
    ]);
    if (dnaError) return serverError(dnaError);
    if (styleProfileError) return serverError(styleProfileError);
    if (!dna) {
      return NextResponse.json({ error: "Complete Company DNA before approving content." }, { status: 422 });
    }

    const finalBody = parsed.data.body !== undefined ? parsed.data.body ?? "" : current.body ?? "";
    if (!finalBody.trim()) {
      return NextResponse.json({ error: "A content body is required before approval." }, { status: 422 });
    }
    const resolvedDna = {
      ...dna,
      style_analysis_profiles: styleProfile ? { [current.content_type]: styleProfile } : {},
    };
    const style = resolveContentStyle(resolvedDna, current.content_type, "Company-approved tone", "");
    const sourceExcerpts = Array.isArray(current.source_references)
      ? current.source_references
        .map((source: unknown) => {
          if (!source || typeof source !== "object") return "";
          const excerpt = (source as Record<string, unknown>).excerpt;
          return typeof excerpt === "string" ? excerpt : "";
        })
        .filter(Boolean)
      : [];
    const warnings = contentQualityWarnings({
      body: finalBody,
      contentType: current.content_type,
      style,
      claimSupportText: claimSupportFromDna(resolvedDna, sourceExcerpts),
    });
    if (warnings.length) {
      return NextResponse.json({
        error: "This draft violates an enforced content quality rule.",
        warnings,
      }, { status: 422 });
    }
    dnaUpdatedAt = dna.updated_at;
    const generationSnapshot =
      current.style_snapshot &&
      typeof current.style_snapshot === "object" &&
      !Array.isArray(current.style_snapshot)
        ? current.style_snapshot as Record<string, unknown>
        : createContentStyleSnapshot(style, current.content_type, dnaUpdatedAt);
    styleSnapshot = {
      ...generationSnapshot,
      approvalValidation: {
        validatedAt: new Date().toISOString(),
        companyDnaUpdatedAt: dnaUpdatedAt,
        styleAnalysis: style.styleAnalysis,
        hardRules: style.hardRules,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("update_content_piece_atomic", {
    p_client_id: parsed.data.client_id,
    p_piece_id: parsed.data.id,
    p_actor_id: user.id,
    p_status: parsed.data.status ?? null,
    p_title: parsed.data.title ?? null,
    p_body: parsed.data.body ?? null,
    p_update_title: parsed.data.title !== undefined,
    p_update_body: parsed.data.body !== undefined,
    p_expected_piece_updated_at: parsed.data.expected_updated_at ?? current.updated_at,
    p_expected_dna_updated_at: dnaUpdatedAt,
    p_style_snapshot: styleSnapshot,
  })
    .single();

  if (error) {
    console.error("[content/pieces PATCH]", error.code, error.message);
    // Codes below are only raised by our own SQL functions with custom,
    // user-safe messages (migrations 088/089/093/094) — safe to return.
    if (error.code === "40001") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.code === "P0002") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.code === "P0001" || error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return serverError(error);
  }

  // Approval used to land silently — tell the author.
  const piece = data as {
    id: string;
    title: string;
    body: string | null;
    content_type: string;
    project_id: string | null;
    created_by: string | null;
  };
  if (parsed.data.status === "approved" && piece.created_by && piece.created_by !== user.id) {
    void notify([piece.created_by], {
      clientId: parsed.data.client_id,
      type: "content_approved",
      title: `Content approved: ${piece.title.slice(0, 120)}`,
      href: "/content",
    });
  }
  if (parsed.data.status === "approved") {
    await recordWorkflowEvent(admin as unknown as PilotDbClient, {
      clientId: parsed.data.client_id,
      projectId: current.project_id,
      pieceId: parsed.data.id,
      actorId: user.id,
      eventType: "draft_approved",
      stage: "complete",
    });
  } else if (parsed.data.body !== undefined || parsed.data.title !== undefined) {
    await recordWorkflowEvent(admin as unknown as PilotDbClient, {
      clientId: parsed.data.client_id,
      projectId: current.project_id,
      pieceId: parsed.data.id,
      actorId: user.id,
      eventType: "draft_revised",
      stage: "edit",
      metadata: {
        bodyChanged: parsed.data.body !== undefined,
        titleChanged: parsed.data.title !== undefined,
      },
    });
  }

  let learningSuggestion = null;
  let editorialWarning: string | null = null;
  const editorialContentChanged =
    (parsed.data.body !== undefined && (parsed.data.body ?? "") !== (current.body ?? "")) ||
    (parsed.data.title !== undefined && parsed.data.title.trim() !== current.title);
  try {
    if (parsed.data.status !== "approved" && editorialContentChanged) {
      learningSuggestion = await recordEditorialRevision({
        admin,
        clientId: parsed.data.client_id,
        projectId: current.project_id,
        pieceId: parsed.data.id,
        actorId: user.id,
        origin: "manual",
        beforeTitle: current.title,
        afterTitle: piece.title,
        beforeBody: current.body ?? "",
        afterBody: piece.body ?? "",
        channel: current.content_type,
        contentType: typeof current.content_brief?.desiredFormat === "string"
          ? current.content_brief.desiredFormat
          : current.content_type,
      });
    }
  } catch (editorialError) {
    editorialWarning = editorialError instanceof Error
      ? editorialError.message
      : "Editorial learning could not be recorded.";
    console.error("[content/pieces editorial]", editorialWarning);
  }

  return NextResponse.json({
    ...piece,
    learning_suggestion: learningSuggestion,
    editorial_warning: editorialWarning,
  });
});
