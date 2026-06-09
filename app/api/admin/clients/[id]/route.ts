import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes").optional(),
});

function requireSuperAdmin(role: string) {
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only." }, { status: 403 });
  }
  return null;
}

// PATCH /api/admin/clients/[id] — update client name/slug
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await requireApiAuth();
  if ("error" in result) return result.error;
  const denied = requireSuperAdmin(result.user.role);
  if (denied) return denied;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 422 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("clients")
    .update(parsed.data)
    .eq("id", params.id)
    .select("id, name, slug, created_at")
    .single();

  if (error) {
    console.error("[admin/clients PATCH]", error.code, error.message);
    if (error.code === "23505") {
      return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/clients/[id] — delete client (cascades users)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await requireApiAuth();
  if ("error" in result) return result.error;
  const denied = requireSuperAdmin(result.user.role);
  if (denied) return denied;

  const admin = createAdminClient();

  // Collect this client's users BEFORE deleting the client. The FK cascade will
  // remove their public.users rows, but NOT their auth.users entries — leaving
  // ghost accounts that can still authenticate (→ "Profile not found") and whose
  // emails stay "taken". We delete those auth accounts explicitly.
  const { data: clientUsers } = await admin
    .from("users")
    .select("id")
    .eq("client_id", params.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("clients")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[admin/clients DELETE]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort auth cleanup — the client (and cascaded user rows) are already
  // gone, so a failure here only leaves an orphaned auth account (logged).
  let authDeleted = 0;
  for (const u of (clientUsers ?? []) as { id: string }[]) {
    const { error: authErr } = await admin.auth.admin.deleteUser(u.id);
    if (authErr) console.error(`[admin/clients DELETE] auth user ${u.id}:`, authErr.message);
    else authDeleted++;
  }

  return NextResponse.json({ success: true, authDeleted });
}
