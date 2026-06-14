import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { similarityRatio } from "@/lib/brain/textdiff";
import { logBrainEvent } from "@/lib/brain/events";

const querySchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["draft", "approved", "archived"]).optional(),
  title: z.string().min(1).max(300).optional(),
  body: z.string().max(50000).optional().nullable(),
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  content_type: z.string().min(1).max(50).optional().default("other"),
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
    })
    .select("id, content_type, title, status, created_at")
    .single();

  if (error) {
    console.error("[content/pieces POST]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
});

// GET /api/content/pieces?client_id=xxx           → list
// GET /api/content/pieces?client_id=xxx&id=yyy    → single (includes body)
export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  const id = searchParams.get("id") ?? undefined;

  const parsed = querySchema.safeParse({ client_id: clientId, id });
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
      .select("id, client_id, content_type, title, brief, body, status, outcome, created_by, created_at, updated_at")
      .eq("id", parsed.data.id)
      .eq("client_id", parsed.data.client_id)
      .single();

    if (error) {
      console.error("[content/pieces GET single]", error.code, error.message);
      return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
    }
    return NextResponse.json(data);
  }

  // List (no body for performance)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_pieces")
    .select("id, content_type, title, status, outcome, created_at")
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[content/pieces GET list]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
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

  // Only admins can approve
  if (parsed.data.status === "approved" && user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Only admins can approve content." }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_pieces")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select("id, content_type, title, brief, body, status, outcome, ai_original, created_by, created_at, updated_at")
    .single();

  if (error) {
    console.error("[content/pieces PATCH]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Approval used to land silently — tell the author.
  const piece = data as { title: string; created_by: string | null };
  if (parsed.data.status === "approved" && piece.created_by && piece.created_by !== user.id) {
    void notify([piece.created_by], {
      clientId: parsed.data.client_id,
      type: "content_approved",
      title: `Content approved: ${piece.title.slice(0, 120)}`,
      href: "/content",
    });
  }

  // Real-outcome learning: when a piece is approved, measure how much the human
  // changed the AI's draft. Kept verbatim → the Brain logs a win; rewritten →
  // it learns the human preferred something else. Best-effort.
  if (parsed.data.status === "approved") {
    void recordApprovalOutcome(admin, parsed.data.client_id, user.id, data);
  }

  return NextResponse.json(data);
});

/**
 * On approval, turn "how much did the human keep?" into a Brain signal. Only
 * fires for AI-generated pieces (those with an ai_original). Never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordApprovalOutcome(admin: any, clientId: string, userId: string, piece: any) {
  try {
    const original: string | null = piece.ai_original ?? null;
    const final: string | null = piece.body ?? null;
    if (!original || !final) return; // not AI-generated, or empty — nothing to learn
    const sim = similarityRatio(original, final);
    const pct = Math.round(sim * 100);
    const kept = sim >= 0.85;
    await admin.from("brain_signals").insert({
      client_id: clientId,
      user_id: userId,
      surface: "content_draft",
      artifact_id: piece.id,
      artifact_text: (kept ? final : original).slice(0, 8000),
      rating: kept ? 1 : -1,
      reason: kept
        ? `Approved ${pct}% as written — the AI draft was on the money`
        : `Rewritten before approval (kept ~${pct}%) — humans preferred a different version`,
      context: { event: "approval", content_type: piece.content_type, kept_pct: pct },
    });
    await logBrainEvent(admin, clientId, "feedback",
      kept
        ? `Approved a ${piece.content_type} draft kept ${pct}% as written — counted as a win`
        : `A ${piece.content_type} draft was rewritten before approval — the Brain noted what to change`,
      { kept_pct: pct, content_type: piece.content_type });
  } catch (e) {
    console.error("[content/pieces] recordApprovalOutcome failed", e);
  }
}
