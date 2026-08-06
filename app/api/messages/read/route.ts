/**
 * POST /api/messages/read — mark the visible thread as read for the caller.
 *
 * Appends the caller to messages.read_by for every message in their client
 * they can see but didn't send. This is what makes the dashboard unread count
 * true — previously nothing ever updated read_by after insert, so the
 * dashboard badge was permanently wrong.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { visibleMessageAudiences } from "@/lib/messages/audience";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ clientId: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // Unread by this user, not sent by them, in their client, AND visible to
  // their role — otherwise a VA would mark (and clear the count of) admin-only
  // messages they can never open. Mirrors the audience filter on the GET read.
  let unreadQuery = admin
    .from("messages")
    .select("id, read_by")
    .eq("client_id", parsed.data.clientId)
    .neq("sender_id", user.id)
    .not("read_by", "cs", `{${user.id}}`)
    .limit(200);
  const audiences = visibleMessageAudiences(user.role);
  if (audiences) unreadQuery = unreadQuery.in("audience", audiences);
  const { data: unread, error } = await unreadQuery;
  if (error) return serverError(error);

  let marked = 0;
  for (const row of (unread ?? []) as { id: string; read_by: string[] | null }[]) {
    const next = [...(row.read_by ?? []), user.id];
    const { error: updateError } = await admin
      .from("messages")
      .update({ read_by: next })
      .eq("id", row.id);
    if (!updateError) marked++;
  }

  return NextResponse.json({ marked });
});
