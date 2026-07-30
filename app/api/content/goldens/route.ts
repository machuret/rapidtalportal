import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import {
  goldenContentHash,
  goldenExampleInputSchema,
  goldenExampleUpdateSchema,
} from "@/lib/content/voice-calibration";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  client_id: z.string().uuid(),
});

const archiveSchema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  expected_updated_at: z.iso.datetime({ offset: true }),
});

function canManage(role: string): boolean {
  return role === "client_admin" || role === "super_admin";
}

const columns = "id,client_id,channel,title,body,source_url,published_at,content_type,represents_brand_strongly,voice_traits,structural_traits,vocabulary_preferences,admin_notes,evaluation_permission,status,content_hash,approved_at,created_at,updated_at";

export const GET = withAuth(async (request, { user }) => {
  const parsed = querySchema.safeParse({
    client_id: request.nextUrl.searchParams.get("client_id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "A valid client is required." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // Service-role access is intentional; the tenant boundary above is mandatory.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_golden_examples")
    .select(columns)
    .eq("client_id", parsed.data.client_id)
    .neq("status", "archived")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
});

export const POST = withAuth(async (request, { user }) => {
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Only client admins and super admins can add golden examples." }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = goldenExampleInputSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_golden_examples")
    .insert({
      ...parsed.data,
      content_hash: goldenContentHash(parsed.data.body),
      status: "proposed",
      created_by: user.id,
      updated_by: user.id,
    })
    .select(columns)
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This exact example is already in the channel’s golden library." }, { status: 409 });
    }
    return serverError(error);
  }
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withAuth(async (request, { user }) => {
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Only client admins and super admins can edit golden examples." }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = goldenExampleUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const updates: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  for (const key of [
    "channel", "title", "body", "source_url", "published_at", "content_type",
    "represents_brand_strongly", "voice_traits", "structural_traits",
    "vocabulary_preferences", "admin_notes", "evaluation_permission", "status",
  ] as const) {
    if (parsed.data[key] !== undefined) updates[key] = parsed.data[key];
  }
  const approvalSensitiveFields = [
    "channel", "title", "body", "source_url", "published_at", "content_type",
    "represents_brand_strongly", "voice_traits", "structural_traits",
    "vocabulary_preferences",
  ] as const;
  if (
    parsed.data.status === undefined &&
    approvalSensitiveFields.some((key) => parsed.data[key] !== undefined)
  ) {
    // An approved example is an evaluation control. Editing its content or
    // interpretation must send it back through review instead of silently
    // changing the active benchmark.
    updates.status = "proposed";
    updates.approved_by = null;
    updates.approved_at = null;
  }
  if (parsed.data.body !== undefined) updates.content_hash = goldenContentHash(parsed.data.body);
  if (parsed.data.status === "approved") {
    if (parsed.data.evaluation_permission !== true) {
      return NextResponse.json({
        error: "Evaluation permission must be granted before approving a golden example.",
      }, { status: 422 });
    }
    updates.approved_by = user.id;
    updates.approved_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_golden_examples")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .eq("updated_at", parsed.data.expected_updated_at)
    .select(columns)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This exact example already exists." }, { status: 409 });
    }
    return serverError(error);
  }
  if (!data) {
    return NextResponse.json({
      error: "This golden example changed in another tab. Reload before saving.",
    }, { status: 409 });
  }
  return NextResponse.json(data);
});

export const DELETE = withAuth(async (request, { user }) => {
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Only client admins and super admins can archive golden examples." }, { status: 403 });
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = archiveSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_golden_examples")
    .update({ status: "archived", updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .eq("updated_at", parsed.data.expected_updated_at)
    .select("id")
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) return NextResponse.json({ error: "Golden example changed before it was archived." }, { status: 409 });
  return NextResponse.json({ success: true });
});
