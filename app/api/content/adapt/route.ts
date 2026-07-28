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
  const rl = aiGenerateLimiter.check(`content-adapt:${user.id}`);
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
    .select("title,body,content_brief,updated_at")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error || !source) return NextResponse.json({ error: error?.message ?? "Content not found." }, { status: 404 });

  const existingBrief = source.content_brief && typeof source.content_brief === "object"
    ? source.content_brief as Record<string, unknown>
    : {};
  const edgeResponse = await proxyToEdgeFunction("content-generate", {
    clientId: parsed.data.client_id,
    contentType: parsed.data.target_type,
    title: `${source.title} — ${parsed.data.target_type}`.slice(0, 300),
    brief: {
      ...existingBrief,
      version: 1,
      objective: `Adapt the source draft into one ${parsed.data.target_type} artifact.`,
      tone: existingBrief.tone ?? "professional",
      length: existingBrief.length ?? "medium",
      mode: "new",
      sourcePieceId: parsed.data.id,
      sourcePieceUpdatedAt: source.updated_at,
      additionalGuidance: "Preserve supported facts and the core message, but rewrite structure, hook, length and CTA for the target platform.",
    },
    sourceContext: source.body ?? "",
    parentPieceId: parsed.data.id,
    generationKind: "adaptation",
  });
  const generated = await edgeResponse.json() as {
    id?: string;
    error?: string;
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
  if (!edgeResponse.ok || !generated.id || !generated.piece) {
    return NextResponse.json({ error: generated.error ?? "Adaptation failed." }, { status: edgeResponse.status });
  }
  return NextResponse.json(generated.piece, { status: 201 });
});
