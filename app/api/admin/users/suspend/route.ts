/**
 * POST /api/admin/users/suspend — suspend or reinstate a user.
 *
 * Suspension = a long auth ban (Supabase ban_duration), so the account keeps
 * its data and client assignment but cannot sign in. Better than deletion for
 * offboarding VAs or pausing a client's team.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";

const schema = z.object({ id: z.string().uuid(), suspend: z.boolean() });

export const POST = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  if (parsed.data.id === user.id) {
    return NextResponse.json({ error: "You can't suspend yourself." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Never suspend the last super admin — same lockout guard as demote/delete.
  if (parsed.data.suspend) {
    const { data: target } = await admin.from("users").select("role").eq("id", parsed.data.id).maybeSingle();
    if ((target as { role: string } | null)?.role === "super_admin") {
      const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("role", "super_admin");
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "Cannot suspend the last super admin." }, { status: 400 });
      }
    }
  }

  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, {
    // ~10 years = suspended until reinstated; "none" lifts the ban.
    ban_duration: parsed.data.suspend ? "87600h" : "none",
  });
  if (error) return serverError(error);

  return NextResponse.json({ ok: true, suspended: parsed.data.suspend });
});
