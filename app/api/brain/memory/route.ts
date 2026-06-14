import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Curated Brain Memory — admins read it, pin/deactivate/delete to correct it. */

const querySchema = z.object({ client_id: z.string().uuid() });
const patchSchema = z.object({
  client_id: z.string().uuid(),
  id:        z.string().uuid(),
  active:    z.boolean().optional(),
  pinned:    z.boolean().optional(),
  content:   z.string().min(1).max(2000).optional(),
});
const deleteSchema = z.object({ client_id: z.string().uuid(), id: z.string().uuid() });

function adminOnly(role: string) {
  return role === "client_admin" || role === "super_admin";
}

export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ client_id: searchParams.get("client_id") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid client_id." }, { status: 400 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("brain_memory")
    .select("id, kind, content, confidence, source_count, active, pinned, created_at")
    .eq("client_id", parsed.data.client_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[brain/memory GET]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
});

export const PATCH = withAuth(async (req, { user }) => {
  if (!adminOnly(user.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  if (parsed.data.pinned !== undefined) updates.pinned = parsed.data.pinned;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("brain_memory")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select()
    .single();

  if (error) {
    console.error("[brain/memory PATCH]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
});

export const DELETE = withAuth(async (req, { user }) => {
  if (!adminOnly(user.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

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
    .from("brain_memory")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id);

  if (error) {
    console.error("[brain/memory DELETE]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
});
