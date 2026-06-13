/**
 * /api/sops/bulk — admin bulk operations on multiple SOPs at once.
 *
 * PATCH  { ids, category?, subcategory?, visibility?, accessUserIds? }
 *        → set any of category / subcategory / visibility (+ access list) on all.
 * DELETE { ids } → delete all.
 *
 * Every SOP's actual scope is authorised (never trust ids), so a client admin
 * can only touch their own client's SOPs and global SOPs stay super-admin only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSopAccess } from "@/lib/sops/sop-access";

const MAX_IDS = 500;

/** Authorise a write against a SOP scope (mirrors the single-SOP route). */
function authorizeScope(user: ApiUser, clientId: string | null): NextResponse | null {
  if (clientId === null) {
    if (user.role !== "super_admin") return NextResponse.json({ error: "Only RapidTal admins can manage the global SOP library." }, { status: 403 });
    return null;
  }
  if (!["client_admin", "super_admin"].includes(user.role)) return NextResponse.json({ error: "Only admins can manage SOPs." }, { status: 403 });
  return assertClientAccess(user, clientId);
}

interface SopRow { id: string; client_id: string | null }

/** Load the SOPs and verify the caller may write every one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAuthorised(admin: any, user: ApiUser, ids: string[]): Promise<{ rows: SopRow[] } | { error: NextResponse }> {
  const { data } = await admin.from("sops").select("id, client_id").in("id", ids);
  const rows = (data ?? []) as SopRow[];
  for (const clientId of Array.from(new Set(rows.map((r) => r.client_id)))) {
    const denied = authorizeScope(user, clientId);
    if (denied) return { error: denied };
  }
  return { rows };
}

const patchSchema = z.object({
  ids:           z.array(z.string().uuid()).min(1).max(MAX_IDS),
  category:      z.string().max(100).optional(),
  subcategory:   z.string().max(100).optional().nullable(),
  visibility:    z.enum(["public", "restricted"]).optional(),
  accessUserIds: z.array(z.string().uuid()).max(1000).optional(),
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const loaded = await loadAuthorised(admin, user, parsed.data.ids);
  if ("error" in loaded) return loaded.error;
  if (!loaded.rows.length) return NextResponse.json({ updated: 0 });
  const ids = loaded.rows.map((r) => r.id);

  // Shared column updates (category / subcategory).
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.category !== undefined) updates.category = parsed.data.category.trim() || "General";
  if (parsed.data.subcategory !== undefined) updates.subcategory = parsed.data.subcategory?.trim() || null;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;

  if (Object.keys(updates).length > 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("sops").update(updates).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Visibility access lists are per-SOP (scope differs), so sync each.
  if (parsed.data.visibility !== undefined) {
    await Promise.all(loaded.rows.map((r) => syncSopAccess(admin, r.id, r.client_id, parsed.data.visibility!, parsed.data.accessUserIds)));
  }

  return NextResponse.json({ updated: ids.length });
}, { roles: ["client_admin", "super_admin"] });

const deleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_IDS) });

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const loaded = await loadAuthorised(admin, user, parsed.data.ids);
  if ("error" in loaded) return loaded.error;
  if (!loaded.rows.length) return NextResponse.json({ deleted: 0 });
  const ids = loaded.rows.map((r) => r.id);

  const { error } = await admin.from("sops").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: ids.length });
}, { roles: ["client_admin", "super_admin"] });
