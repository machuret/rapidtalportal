import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";

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

// GET /api/content/pieces?client_id=xxx           → list
// GET /api/content/pieces?client_id=xxx&id=yyy    → single (includes body)
export async function GET(req: NextRequest) {
  const result = await requireApiAuth();
  if ("error" in result) return result.error;
  const { user } = result;

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
      .select("id, client_id, content_type, title, brief, body, status, created_by, created_at, updated_at")
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
    .select("id, content_type, title, status, created_at")
    .eq("client_id", parsed.data.client_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[content/pieces GET list]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// PATCH /api/content/pieces — update status, title, or body
export async function PATCH(req: NextRequest) {
  const result = await requireApiAuth();
  if ("error" in result) return result.error;
  const { user } = result;

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
    .select("id, content_type, title, brief, body, status, created_by, created_at, updated_at")
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

  return NextResponse.json(data);
}
