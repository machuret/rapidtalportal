import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBrainMemoryScope } from "@/supabase/functions/_shared/brain-memory-scope";
import { embedTexts } from "@/lib/brain/embed";

const querySchema = z.object({
  client_id: z.string().uuid(),
  status: z.enum(["pending", "use_draft", "proposed", "approved", "dismissed", "rejected"]).optional(),
});

const responseSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  action: z.enum(["use_draft", "remember_channel", "remember_content_type", "review", "dismiss"]),
});

const reviewSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  scope: z.object({
    surfaces: z.array(z.enum(["ask", "content", "compose", "tool"])).optional(),
    channels: z.array(z.enum(["linkedin", "facebook", "instagram", "email", "blog", "newsletter"])).optional(),
    contentTypes: z.array(z.string().trim().min(1).max(120)).optional(),
    audiences: z.array(z.string().trim().min(1).max(200)).optional(),
    objectives: z.array(z.string().trim().min(1).max(200)).optional(),
    global: z.boolean().optional(),
  }).optional(),
});

function canApprove(role: string) {
  return role === "client_admin" || role === "super_admin";
}

export const GET = withAuth(async (req, { user }) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    client_id: url.searchParams.get("client_id"),
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid learning inbox query." }, { status: 400 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("editorial_learning_suggestions")
    .select("id,client_id,project_id,piece_id,event_id,classification,proposed_outcome,dimensions,summary,lesson_content,explanation,before_excerpt,after_excerpt,proposed_scope,confidence,status,signal_id,memory_id,created_by,reviewed_by,reviewed_at,created_at,updated_at,content_pieces(title,content_type)")
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false })
    .limit(300);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  const { data, error } = await query;
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: suggestion, error } = await db
    .from("editorial_learning_suggestions")
    .select("*,content_pieces(title,body,content_type,content_brief)")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error) return error.code === "PGRST116"
    ? NextResponse.json({ error: "Learning suggestion not found." }, { status: 404 })
    : serverError(error);
  if (suggestion.status !== "pending") {
    return NextResponse.json({ error: "This learning suggestion has already been handled." }, { status: 409 });
  }

  if (parsed.data.action === "use_draft" || parsed.data.action === "dismiss") {
    const status = parsed.data.action === "use_draft" ? "use_draft" : "dismissed";
    const { data, error: updateError } = await db
      .from("editorial_learning_suggestions")
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", suggestion.id)
      .eq("client_id", parsed.data.client_id)
      .select()
      .single();
    if (updateError) return serverError(updateError);
    return NextResponse.json(data);
  }

  const piece = Array.isArray(suggestion.content_pieces)
    ? suggestion.content_pieces[0]
    : suggestion.content_pieces;
  const originalScope = normalizeBrainMemoryScope(suggestion.proposed_scope);
  const proposedScope = parsed.data.action === "remember_channel"
    ? {
        surfaces: ["content"],
        channels: [piece?.content_type].filter(Boolean),
        global: false,
      }
    : parsed.data.action === "remember_content_type"
      ? {
          surfaces: ["content"],
          contentTypes: [
            typeof piece?.content_brief?.desiredFormat === "string"
              ? piece.content_brief.desiredFormat
              : piece?.content_type,
          ].filter(Boolean),
          global: false,
        }
      : originalScope;

  let signalId: string | null = suggestion.signal_id ?? null;
  if (
    !signalId &&
    ["brain_preference", "brain_anti_pattern"].includes(suggestion.proposed_outcome)
  ) {
    const { data: signal, error: signalError } = await db
      .from("brain_signals")
      .insert({
        client_id: parsed.data.client_id,
        user_id: user.id,
        surface: "content_draft",
        artifact_id: suggestion.piece_id,
        artifact_text: piece?.body ?? suggestion.after_excerpt,
        rating: suggestion.proposed_outcome === "brain_anti_pattern" ? -1 : 1,
        reason: `${suggestion.summary} ${suggestion.explanation}`.trim(),
        dimensions: suggestion.dimensions,
        channel: piece?.content_type ?? null,
        content_type: typeof piece?.content_brief?.desiredFormat === "string"
          ? piece.content_brief.desiredFormat
          : piece?.content_type ?? null,
        learning_intent: "explicit_revision_teaching",
        editorial_event_id: suggestion.event_id,
        // This signal is consumed by this explicit inbox suggestion. Keeping it
        // out of general distillation prevents a second duplicate lesson from
        // being proposed before the suggestion is reviewed.
        distilled_at: new Date().toISOString(),
        context: {
          event: "explicit_revision_teaching",
          suggestionId: suggestion.id,
          requestedAction: parsed.data.action,
        },
      })
      .select("id")
      .single();
    if (signalError) return serverError(signalError);
    signalId = signal.id;
  }

  const { data, error: updateError } = await db
    .from("editorial_learning_suggestions")
    .update({
      status: "proposed",
      proposed_scope: proposedScope,
      signal_id: signalId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("client_id", parsed.data.client_id)
    .select()
    .single();
  if (updateError) return serverError(updateError);
  return NextResponse.json(data);
});

export const PATCH = withAuth(async (req, { user }) => {
  if (!canApprove(user.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  const admin = createAdminClient();

  if (parsed.data.action === "approve") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .rpc("approve_editorial_learning_suggestion", {
        p_client_id: parsed.data.client_id,
        p_suggestion_id: parsed.data.id,
        p_actor_id: user.id,
        p_scope: parsed.data.scope ?? null,
      })
      .single();
    if (error) return serverError(error);
    const approved = data as { memory_id?: string | null; lesson_content?: string } | null;
    if (approved?.memory_id && approved.lesson_content) {
      const vectors = await embedTexts([approved.lesson_content]);
      const vector = vectors?.[0];
      if (vector?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: embeddingError } = await (admin as any)
          .from("brain_memory")
          .update({
            embedding: vector,
            embedding_vector: `[${vector.join(",")}]`,
          })
          .eq("id", approved.memory_id)
          .eq("client_id", parsed.data.client_id);
        if (embeddingError) {
          console.error("[brain/learning-inbox embedding]", embeddingError.message);
        }
      }
    }
    return NextResponse.json(data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("editorial_learning_suggestions")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select()
    .single();
  if (error) return serverError(error);
  return NextResponse.json(data);
});
