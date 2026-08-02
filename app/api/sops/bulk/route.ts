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
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "@/types/database";
import { syncSopAccess, authorizeScope } from "@/lib/sops/sop-access";

const MAX_IDS = 500;

interface SopRow { id: string; client_id: string | null }

/** Load the SOPs and verify the caller may write every one. */
async function loadAuthorised(admin: SupabaseClient<Database>, user: ApiUser, ids: string[]): Promise<{ rows: SopRow[] } | { error: NextResponse }> {
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
  const updates: TablesUpdate<"sops"> = { updated_at: new Date().toISOString() };
  if (parsed.data.category !== undefined) updates.category = parsed.data.category.trim() || "General";
  if (parsed.data.subcategory !== undefined) updates.subcategory = parsed.data.subcategory?.trim() || null;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;

  if (Object.keys(updates).length > 1) {
    const { error } = await admin.from("sops").update(updates).in("id", ids);
    if (error) return serverError(error);
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

  // Soft delete — recoverable, mirroring the single-SOP DELETE.
  const { error } = await admin.from("sops").update({ deleted_at: new Date().toISOString() }).in("id", ids);
  if (error) return serverError(error);
  return NextResponse.json({ deleted: ids.length });
}, { roles: ["client_admin", "super_admin"] });
