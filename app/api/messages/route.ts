/**
 * GET /api/messages?clientId= — the shared client⇄VA message thread.
 *
 * Reads through the service-role admin client (scoped to the caller's client
 * in code via assertClientAccess), mirroring every other reliable read in the
 * app. This deliberately does NOT rely on the browser client's RLS query,
 * which is fragile here (the messages_select policy predates the SECURITY
 * DEFINER recursion fix) and was surfacing "Failed to load messages".
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });

  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  // Delta polls: return only messages newer than this ISO timestamp.
  const updatedAfter = req.nextUrl.searchParams.get("updated_after");
  if (updatedAfter && Number.isNaN(Date.parse(updatedAfter))) {
    return NextResponse.json({ error: "Invalid updated_after." }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("messages")
    .select("id, client_id, sender_id, sender_name, sender_role, body, audience, read_by, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    // Bounded: the thread used to ship entire history on every load and poll.
    .limit(100);
  if (updatedAfter) query = query.gt("created_at", updatedAfter);
  if (user.role === "client_admin") {
    query = query.or(`audience.in.(company,client),sender_id.eq.${user.id}`);
  } else if (user.role === "va") {
    query = query.or(`audience.in.(company,va_team),sender_id.eq.${user.id}`);
  }
  const { data, error } = await query;

  // Surface the real Postgres error (e.g. missing table) instead of a generic
  // string — it lands in /admin/errors via the withAuth wrapper if it throws,
  // and here we return it so the client can show something actionable.
  if (error) return serverError(error);

  return NextResponse.json({ messages: [...(data ?? [])].reverse() });
});
