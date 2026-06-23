/**
 * GET /api/crm/events?contactId — the activity trail for one contact:
 * created / status moves / edits / archive / restore, with who and when.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

export const GET = withAuth(async (req, { user }) => {
  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "Missing contactId." }, { status: 400 });

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("crm_contacts")
    .select("id, client_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const denied = assertClientAccess(user, (contact as { client_id: string }).client_id);
  if (denied) return denied;

  const { data: events, error } = await admin
    .from("crm_events")
    .select("id, user_id, body, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return serverError(error);

  const rows = (events ?? []) as { id: string; user_id: string | null; body: string; created_at: string }[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: people } = await admin.from("users").select("id, full_name, email").in("id", userIds);
    for (const p of (people ?? []) as { id: string; full_name: string | null; email: string }[]) {
      names.set(p.id, p.full_name ?? p.email);
    }
  }

  return NextResponse.json({
    events: rows.map((r) => ({
      id: r.id,
      body: r.body,
      who: r.user_id ? (names.get(r.user_id) ?? "Removed user") : "System",
      created_at: r.created_at,
    })),
  });
});
