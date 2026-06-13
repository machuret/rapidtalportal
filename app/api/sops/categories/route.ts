/**
 * POST /api/sops/categories — rename / merge a SOP category or subcategory.
 *
 * Categories are just a field on `sops`, so "rename" = update every SOP in scope
 * whose category (or subcategory) matches `from` to `to`. Renaming onto an
 * existing name merges them. For subcategory, an empty `to` clears it. Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function authorizeScope(user: ApiUser, clientId: string | null): NextResponse | null {
  if (clientId === null) {
    if (user.role !== "super_admin") return NextResponse.json({ error: "Global library is super-admin only." }, { status: 403 });
    return null;
  }
  if (!["client_admin", "super_admin"].includes(user.role)) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  return assertClientAccess(user, clientId);
}

const schema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  kind:     z.enum(["category", "subcategory"]),
  from:     z.string().min(1).max(100),
  to:       z.string().max(100), // subcategory may be "" to clear
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeScope(user, clientId);
  if (denied) return denied;

  const from = parsed.data.from.trim();
  const isCategory = parsed.data.kind === "category";
  const to = isCategory ? (parsed.data.to.trim() || "General") : (parsed.data.to.trim() || null);
  if (isCategory && to === from) return NextResponse.json({ updated: 0 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any).from("sops").update({ [parsed.data.kind]: to, updated_at: new Date().toISOString() }).eq(parsed.data.kind, from);
  q = clientId === null ? q.is("client_id", null) : q.eq("client_id", clientId);
  const { error, count } = await q.select("id", { count: "exact" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: count ?? 0 });
}, { roles: ["client_admin", "super_admin"] });
