/**
 * GET /api/access/reveals?id=<credentialId> — who viewed this password, when.
 *
 * The audit rows have been written on every reveal since the Access section
 * shipped; this endpoint finally exposes them. Admin-only: the trail is a
 * supervision tool, not something VAs browse.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const ADMIN_ROLES = ["client_admin", "super_admin"];

export const GET = withAuth(async (req, { user }) => {
  const credentialId = req.nextUrl.searchParams.get("id");
  if (!credentialId) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("access_credentials")
    .select("id, client_id")
    .eq("id", credentialId)
    .maybeSingle();
  if (!cred) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const denied = assertClientAccess(user, (cred as { client_id: string }).client_id);
  if (denied) return denied;

  const { data: reveals, error } = await admin
    .from("access_credential_reveals")
    .select("user_id, revealed_at")
    .eq("credential_id", credentialId)
    .order("revealed_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (reveals ?? []) as { user_id: string | null; revealed_at: string }[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: people } = await admin.from("users").select("id, full_name, email").in("id", userIds);
    for (const p of (people ?? []) as { id: string; full_name: string | null; email: string }[]) {
      names.set(p.id, p.full_name ?? p.email);
    }
  }

  return NextResponse.json({
    reveals: rows.map((r) => ({
      who: r.user_id ? (names.get(r.user_id) ?? "Removed user") : "Removed user",
      at: r.revealed_at,
    })),
  });
}, { roles: ADMIN_ROLES });
