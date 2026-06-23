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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .select("id, client_id, sender_id, sender_name, sender_role, body, read_by, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  // Surface the real Postgres error (e.g. missing table) instead of a generic
  // string — it lands in /admin/errors via the withAuth wrapper if it throws,
  // and here we return it so the client can show something actionable.
  if (error) return serverError(error);

  return NextResponse.json({ messages: data ?? [] });
});
