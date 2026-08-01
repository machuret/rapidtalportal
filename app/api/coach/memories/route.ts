import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";

const clientIdSchema = z.string().uuid();
const mutationSchema = z.object({
  clientId: clientIdSchema, id: z.string().uuid(),
  status: z.enum(["active", "muted"]).optional(),
  content: z.string().trim().min(3).max(2000).optional(),
});

export const GET = withAuth(async (request, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach memory is unavailable while viewing as another user." }, { status: 409 });
  const parsed = clientIdSchema.safeParse(request.nextUrl.searchParams.get("clientId"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid clientId." }, { status: 400 });
  const denied = assertClientAccess(user, parsed.data);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 140 precedes generated types
  const db = createAdminClient() as any;
  const result = await db.from("coach_memories")
    .select("id,kind,content,status,source_turn_id,created_at,updated_at")
    .eq("client_id", parsed.data).eq("owner_id", user.id)
    .order("updated_at", { ascending: false }).limit(100);
  if (result.error) return serverError(result.error);
  return NextResponse.json({ memories: result.data ?? [], retention: "until_deleted" });
});

export const PATCH = withAuth(async (request, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach memory is unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success || (parsed.data.status === undefined && parsed.data.content === undefined)) {
    return NextResponse.json({ error: "Invalid memory update." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 140 precedes generated types
  const db = createAdminClient() as any;
  const updates = { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.content ? { content: parsed.data.content } : {}), updated_at: new Date().toISOString() };
  const result = await db.from("coach_memories").update(updates)
    .eq("id", parsed.data.id).eq("client_id", parsed.data.clientId).eq("owner_id", user.id)
    .select("id,kind,content,status,source_turn_id,created_at,updated_at").maybeSingle();
  if (result.error) return serverError(result.error);
  if (!result.data) return NextResponse.json({ error: "Private memory not found." }, { status: 404 });
  return NextResponse.json({ memory: result.data });
});

export const DELETE = withAuth(async (request, { user, impersonating }) => {
  if (impersonating) return NextResponse.json({ error: "Coach memory is unavailable while viewing as another user." }, { status: 409 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = mutationSchema.pick({ clientId: true, id: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid memory." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 140 precedes generated types
  const db = createAdminClient() as any;
  const result = await db.from("coach_memories").delete()
    .eq("id", parsed.data.id).eq("client_id", parsed.data.clientId).eq("owner_id", user.id);
  if (result.error) return serverError(result.error);
  return NextResponse.json({ success: true });
});
