/**
 * POST /api/sops/restore — un-delete a soft-deleted SOP (clears deleted_at).
 * Same scope rules as delete: super_admin for the global library, admins for
 * their own client. The mirror of the soft-delete in /api/sops DELETE.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeScope } from "@/lib/sops/sop-access";

const schema = z.object({ id: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("sops").select("id, client_id, deleted_at").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

  const row = existing as { client_id: string | null; deleted_at: string | null };
  const denied = authorizeScope(user, row.client_id);
  if (denied) return denied;

  if (!row.deleted_at) return NextResponse.json({ ok: true }); // already live — no-op

  const { error } = await admin
    .from("sops")
    .update({ deleted_at: null })
    .eq("id", parsed.data.id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
});
