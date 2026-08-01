import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { aiGenerateLimiter, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  target_type: z.enum(["email", "x", "linkedin", "facebook", "instagram", "newsletter", "blog", "message", "other"]),
});

export const POST = withAuth(async (req, { user }) => {
  const rl = await aiGenerateLimiter.check(`content-adapt:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: source, error } = await (admin as any)
    .from("content_pieces")
    .select("project_id,title,body,content_brief,updated_at")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error || !source) return NextResponse.json({ error: error?.message ?? "Content not found." }, { status: 404 });

  const existingBrief = source.content_brief && typeof source.content_brief === "object"
    ? source.content_brief as Record<string, unknown>
    : {};
  let projectVaultSourceIds: string[] | undefined;
  if (source.project_id) {
    const { data: project, error: projectError } = await admin
      .from("content_projects")
      .select("id,vault_source_ids")
      .eq("id", source.project_id)
      .eq("client_id", parsed.data.client_id)
      .maybeSingle();
    if (projectError) {
      return NextResponse.json({ error: "The connected project could not be loaded." }, { status: 503 });
    }
    if (!project) {
      return NextResponse.json({ error: "The connected project was not found." }, { status: 409 });
    }
    projectVaultSourceIds = project.vault_source_ids ?? [];
  }
  const adaptedBrief = {
    ...existingBrief,
    version: 1,
    objective: `Adapt the source draft into one ${parsed.data.target_type} artifact.`,
    tone: existingBrief.tone ?? "professional",
    length: existingBrief.length ?? "medium",
    mode: "new",
    sourcePieceId: parsed.data.id,
    sourcePieceUpdatedAt: source.updated_at,
    additionalGuidance: "Preserve supported facts and the core message, but rewrite structure, hook, length and CTA for the target platform.",
  };
  const edgeResponse = await proxyToEdgeFunction("content-generate", {
    clientId: parsed.data.client_id,
    contentType: parsed.data.target_type,
    title: `${source.title} — ${parsed.data.target_type}`.slice(0, 300),
    brief: adaptedBrief,
    sourceContext: source.body ?? "",
    parentPieceId: parsed.data.id,
    generationKind: "adaptation",
    ...(source.project_id
      ? {
          persist: false,
          projectId: source.project_id,
          vaultSourceIds: projectVaultSourceIds,
        }
      : {}),
  });
  const generated = await edgeResponse.json() as {
    id?: string;
    error?: string;
    body?: string;
    sources?: unknown[];
    styleSnapshot?: Record<string, unknown>;
    piece?: {
      id: string;
      content_type: string;
      title: string;
      status: string;
      generation_kind: string;
      parent_piece_id: string | null;
      created_at: string;
    };
  };
  if (!edgeResponse.ok) {
    return NextResponse.json({ error: generated.error ?? "Adaptation failed." }, { status: edgeResponse.status });
  }
  if (source.project_id) {
    if (!generated.body || !generated.styleSnapshot) {
      return NextResponse.json({ error: "The connected adaptation was incomplete." }, { status: 502 });
    }
    // Supabase's generated client cannot infer the newly introduced migration
    // until production types are refreshed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { data: connectedPiece, error: insertError } = await db
      .rpc("create_content_project_derived_draft", {
        p_client_id: parsed.data.client_id,
        p_project_id: source.project_id,
        p_parent_piece_id: parsed.data.id,
        p_actor_id: user.id,
        p_content_type: parsed.data.target_type,
        p_title: `${source.title} — ${parsed.data.target_type}`.slice(0, 300),
        p_body: generated.body,
        p_content_brief: adaptedBrief,
        p_source_references: generated.sources ?? [],
        p_style_snapshot: generated.styleSnapshot,
        p_generation_kind: "adaptation",
      })
      .single();
    if (insertError) {
      const status = insertError.code === "42501"
        ? 403
        : insertError.code === "P0002"
          ? 404
          : insertError.code === "P0001" || insertError.code === "22023"
            ? 422
            : 500;
      return NextResponse.json({
        error: status === 500 ? "The adaptation could not be saved." : insertError.message,
      }, { status });
    }
    return NextResponse.json(connectedPiece, { status: 201 });
  }
  if (!generated.id || !generated.piece) {
    return NextResponse.json({ error: "The adaptation was not saved." }, { status: 502 });
  }
  return NextResponse.json(generated.piece, { status: 201 });
});
