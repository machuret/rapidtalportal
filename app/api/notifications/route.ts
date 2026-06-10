/**
 * Notifications — read + mark-read for the signed-in user.
 * GET   — latest 30 + unread count.
 * PATCH — { id } marks one read; { all: true } marks everything read.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/api/with-auth";

const patchSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
]);

export const GET = withAuth(async (_req, { user }) => {
  const admin = createAdminClient();
  const [{ data: items, error }, { count }] = await Promise.all([
    admin
      .from("notifications")
      .select("id, type, title, body, href, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: items ?? [], unread: count ?? 0 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  let query = admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if ("id" in parsed.data) query = query.eq("id", parsed.data.id);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
