/**
 * Admin management of placements (VA<->client engagements). Super-admin only.
 * POST  — create a placement and seed its Notebook with the starter templates.
 * PATCH — change status (active / paused / ended). Pausing/ending revokes
 *         Notebook access via RLS (participation requires status = 'active').
 *
 * Admins manage the engagement record but never see Notebook content.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { seedPlacementNotebook } from "@/lib/notebook/seed";

const createSchema = z.object({
  clientId: z.string().uuid(),
  vaUserId: z.string().uuid(),
  clientUserId: z.string().uuid(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "ended"]),
});

export const POST = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });
  const { clientId, vaUserId, clientUserId } = parsed.data;
  if (vaUserId === clientUserId) return NextResponse.json({ error: "VA and client must be different users." }, { status: 422 });

  const admin = createAdminClient();
  const { data: people } = await admin.from("users").select("id, role, client_id").in("id", [vaUserId, clientUserId]);
  const va = (people ?? []).find((p) => p.id === vaUserId) as { role: string; client_id: string | null } | undefined;
  const cl = (people ?? []).find((p) => p.id === clientUserId) as { role: string; client_id: string | null } | undefined;
  if (!va || va.role !== "va" || va.client_id !== clientId) {
    return NextResponse.json({ error: "VA must belong to the selected client." }, { status: 422 });
  }
  if (!cl || !["client_admin", "client"].includes(cl.role) || cl.client_id !== clientId) {
    return NextResponse.json({ error: "Client contact must belong to the selected client." }, { status: 422 });
  }

  const { data, error } = await admin
    .from("placements")
    .insert({ client_id: clientId, va_user_id: vaUserId, client_user_id: clientUserId })
    .select("id, client_id, va_user_id, client_user_id, status, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That VA and client are already placed together." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seeded = await seedPlacementNotebook((data as { id: string }).id);
  return NextResponse.json({ ...data, seeded }, { status: 201 });
});

export const PATCH = withSuperAdmin(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("placements")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id, status")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Newly active placement with an empty Notebook gets seeded (idempotent).
  if (parsed.data.status === "active") await seedPlacementNotebook(parsed.data.id);
  return NextResponse.json(data);
});
