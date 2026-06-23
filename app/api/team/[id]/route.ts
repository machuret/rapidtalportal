/**
 * PATCH /api/team/[id] — Admin updates a VA's extended profile fields.
 *
 * Only client_admin and super_admin can call this route.
 * The VA being updated must belong to the calling admin's client.
 * Fields: salary, payment_terms, payment_details, whatsapp, personal_email,
 *         address, timezone, skills, full_name, phone, birthday.
 */

import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  full_name:       z.string().min(1).max(120).optional(),
  phone:           z.string().max(30).optional().nullable(),
  birthday:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  salary:          z.number().min(0).max(9999999).optional().nullable(),
  payment_terms:   z.string().max(200).optional().nullable(),
  payment_details: z.string().max(1000).optional().nullable(),
  whatsapp:        z.string().max(30).optional().nullable(),
  personal_email:  z.string().email().max(200).optional().nullable(),
  address:         z.string().max(500).optional().nullable(),
  timezone:        z.string().max(100).optional().nullable(),
  skills:          z.array(z.string().max(50)).max(30).optional().nullable(),
});

export const PATCH = withAuth<{ id: string }>(async (req, { user, params }) => {
  if (user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden. Admins only." }, { status: 403 });
  }

  const admin = createAdminClient();

  // Verify the target VA exists and belongs to the admin's client
  const { data: targetUser } = await admin
    .from("users")
    .select("id, client_id, role")
    .eq("id", params.id)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (targetUser.role !== "va") {
    return NextResponse.json({ error: "Can only edit VA profiles." }, { status: 403 });
  }

  const accessErr = assertClientAccess(user, targetUser.client_id as string);
  if (accessErr) return accessErr;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { data, error } = await admin
    .from("users")
    .update(parsed.data)
    .eq("id", params.id)
    .select("id, full_name, phone, birthday, salary, payment_terms, payment_details, whatsapp, personal_email, address, timezone, skills")
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data);
});
