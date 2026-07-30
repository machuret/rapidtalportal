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
  scope: z.enum(["full", "section"]),
  instruction: z.string().trim().min(2).max(2000),
  expected_updated_at: z.string().datetime(),
  selectedText: z.string().min(1).max(20000).optional(),
  selectionStart: z.number().int().min(0).optional(),
  selectionEnd: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (
    value.scope === "section" &&
    (!value.selectedText ||
      value.selectionStart === undefined ||
      value.selectionEnd === undefined ||
      value.selectionEnd <= value.selectionStart)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid text selection is required." });
  }
});

function mergeSources(existing: unknown, generated: unknown): unknown[] {
  const merged = new Map<string, unknown>();
  for (const source of [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(generated) ? generated : []),
  ]) {
    if (!source || typeof source !== "object") continue;
    const row = source as Record<string, unknown>;
    if (typeof row.itemId !== "string") continue;
    merged.set(row.itemId, source);
  }
  return [...merged.values()].slice(0, 30);
}

export const POST = withAuth(async (req, { user }) => {
  const rl = aiGenerateLimiter.check(`content-rewrite:${user.id}`);
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
  const { data: piece, error } = await (admin as any)
    .from("content_pieces")
    .select("id,project_id,content_type,title,body,status,content_brief,source_references,style_snapshot,updated_at")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error || !piece) {
    return NextResponse.json({ error: error?.message ?? "Content not found." }, { status: 404 });
  }
  if (piece.status !== "draft") {
    return NextResponse.json({ error: "Return this content to draft before rewriting it." }, { status: 409 });
  }

  const originalBody = piece.body ?? "";
  const target = parsed.data.scope === "section" ? parsed.data.selectedText! : originalBody;
  const selectionStart = parsed.data.selectionStart ?? 0;
  const selectionEnd = parsed.data.selectionEnd ?? originalBody.length;
  if (
    parsed.data.scope === "section" &&
    originalBody.slice(selectionStart, selectionEnd) !== target
  ) {
    return NextResponse.json({ error: "The selected section is no longer current. Reload and try again." }, { status: 409 });
  }

  const existingBrief = piece.content_brief && typeof piece.content_brief === "object"
    ? piece.content_brief as Record<string, unknown>
    : {};
  let projectVaultSourceIds: string[] | undefined;
  if (piece.project_id) {
    const { data: project, error: projectError } = await admin
      .from("content_projects")
      .select("id,vault_source_ids")
      .eq("id", piece.project_id)
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
  const resolvedBrief = {
    ...existingBrief,
    version: 1,
    tone: existingBrief.tone ?? "professional",
    length: existingBrief.length ?? "medium",
    mode: "new",
    additionalGuidance: [
      typeof existingBrief.additionalGuidance === "string"
        ? existingBrief.additionalGuidance
        : "",
      `Editorial rewrite instruction: ${parsed.data.instruction}`,
      parsed.data.scope === "section"
        ? "Rewrite only the selected section. Return only its replacement text."
        : "Rewrite the complete draft. Return the complete replacement draft.",
    ].filter(Boolean).join("\n"),
  };
  const edgeResponse = await proxyToEdgeFunction("content-generate", {
    clientId: parsed.data.client_id,
    contentType: piece.content_type,
    title: piece.title,
    persist: false,
    brief: resolvedBrief,
    sourceContext: target,
    projectId: piece.project_id ?? undefined,
    vaultSourceIds: projectVaultSourceIds,
    parentPieceId: piece.id,
    generationKind: "rewrite",
  });
  const generated = await edgeResponse.json() as {
    error?: string;
    body?: string;
    sources?: unknown[];
    styleSnapshot?: Record<string, unknown>;
  };
  if (!edgeResponse.ok || !generated.body) {
    return NextResponse.json({ error: generated.error ?? "Rewrite failed." }, { status: edgeResponse.status });
  }

  const nextBody = parsed.data.scope === "section"
    ? `${originalBody.slice(0, selectionStart)}${generated.body.trim()}${originalBody.slice(selectionEnd)}`
    : generated.body.trim();
  const sourceReferences = mergeSources(piece.source_references, generated.sources);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateError } = await (admin as any)
    .rpc("commit_content_piece_rewrite", {
      p_client_id: parsed.data.client_id,
      p_piece_id: parsed.data.id,
      p_actor_id: user.id,
      p_expected_updated_at: parsed.data.expected_updated_at,
      p_body: nextBody,
      p_content_brief: existingBrief,
      p_source_references: sourceReferences,
      p_style_snapshot: piece.style_snapshot ?? generated.styleSnapshot ?? {},
      p_reason: parsed.data.scope === "section" ? "section rewrite" : "full rewrite",
    })
    .single();
  if (updateError) {
    const status = updateError.code === "40001"
      ? 409
      : updateError.code === "42501"
        ? 403
        : updateError.code === "P0002"
          ? 404
          : updateError.code === "P0001" || updateError.code === "22023"
            ? 422
            : 500;
    return NextResponse.json({ error: updateError.message }, { status });
  }

  return NextResponse.json({
    ...updated,
    sources: generated.sources ?? [],
  });
});
