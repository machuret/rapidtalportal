import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  client_id:    z.string().uuid(),
  title:        z.string().min(1).max(300),
  description:  z.string().max(2000).optional().nullable(),
  content_type: z.enum([
    "email",
    "x",
    "linkedin",
    "facebook",
    "instagram",
    "social",
    "newsletter",
    "blog",
  ]),
  // Brain pre-screen carried over from the suggestion, so we can later measure
  // whether low-fit predictions actually got rejected (prediction accuracy).
  ai_fit_score: z.number().int().min(0).max(100).optional().nullable(),
  ai_flagged:   z.boolean().optional(),
  why:          z.record(z.string(), z.unknown()).optional().nullable(),
});

const updateSchema = z.object({
  client_id: z.string().uuid(),
  id:        z.string().uuid(),
  status:    z.enum(["pending", "approved", "rejected"]).optional(),
  title:     z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional().nullable(),
  flagged:     z.boolean().optional(),
  flag_reason: z.string().max(2000).optional().nullable(),
});

const deleteSchema = z.object({
  client_id: z.string().uuid(),
  id:        z.string().uuid(),
});

const querySchema = z.object({
  client_id: z.string().uuid(),
});

// GET /api/content/topics?client_id=xxx
export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");

  const parsed = querySchema.safeParse({ client_id: clientId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client_id." }, { status: 400 });
  }

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_topics")
    .select("id, title, description, content_type, status, created_at, created_by, approved_by, approved_at, why, ai_fit_score, ai_flagged")
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[content/topics GET]", error.code, error.message);
    return serverError(error);
  }

  return NextResponse.json(data ?? []);
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_topics")
    .insert({
      client_id:    parsed.data.client_id,
      title:        parsed.data.title,
      description:  parsed.data.description ?? null,
      content_type: parsed.data.content_type,
      created_by:   user.id,
      ai_fit_score: parsed.data.ai_fit_score ?? null,
      ai_flagged:   parsed.data.ai_flagged ?? false,
      why:          parsed.data.why ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[content/topics POST]", error.code, error.message);
    return serverError(error);
  }
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  // VAs run the Content workflow end-to-end for their assigned client. Tenant
  // access is still enforced below, while client/super admins retain authority.
  if (!["va", "client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "approved") {
      updates.approved_by = user.id;
      updates.approved_at = new Date().toISOString();
    }
  }
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.flagged !== undefined) updates.flagged = parsed.data.flagged;
  if (parsed.data.flag_reason !== undefined) updates.flag_reason = parsed.data.flag_reason;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_topics")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select()
    .single();

  if (error) {
    console.error("[content/topics PATCH]", error.code, error.message);
    return serverError(error);
  }

  // Feed the Brain: a reject/flag is a 👎 (with reason), an approve is a 👍.
  // Best-effort — a logging failure must not fail the user's action.
  const isNegative = parsed.data.status === "rejected" || parsed.data.flagged === true;
  const isPositive = parsed.data.status === "approved";
  if ((isNegative || isPositive) && data) {
    const artifactText = [data.title, data.description].filter(Boolean).join(" — ").slice(0, 8000);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: signalError } = await (admin as any).from("brain_signals").insert({
        client_id:     parsed.data.client_id,
        user_id:       user.id,
        surface:       "content_topic",
        artifact_id:   parsed.data.id,
        artifact_text: artifactText || data.title || "(topic)",
        rating:        isNegative ? -1 : 1,
        reason:        parsed.data.flag_reason ?? null,
        context:       { content_type: data.content_type },
      });
      if (signalError) throw signalError;
    } catch (e) {
      console.error("[content/topics PATCH] brain_signals insert failed", e);
    }
  }

  return NextResponse.json(data);
});

export const DELETE = withAuth(async (req, { user }) => {
  if (!["va", "client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("content_topics")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id);

  if (error) {
    console.error("[content/topics DELETE]", error.code, error.message);
    return serverError(error);
  }
  return NextResponse.json({ success: true });
});
