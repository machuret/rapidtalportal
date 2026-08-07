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
  const audiences = visibleMessageAudiences(user.role);
  // One set-based UPDATE (migration 20260806000300) instead of an N+1
  // read-modify-write loop: append the caller to read_by for every message in
  // their client, visible to their role, that they didn't send and haven't read.
  // The audience filter mirrors the GET read so a VA never marks admin-only notes.
  const { data: marked, error } = await admin.rpc("mark_messages_read", {
    p_client: parsed.data.clientId,
    p_user: user.id,
    p_audiences: audiences ?? null,
  });
  if (error) return serverError(error);

  return NextResponse.json({ marked: marked ?? 0 });
});
