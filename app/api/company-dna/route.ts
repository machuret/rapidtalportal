import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  client_id:          z.string().uuid(),
  company_name:       z.string().max(200).optional().nullable(),
  founders:           z.string().max(500).optional().nullable(),
  location:           z.string().max(200).optional().nullable(),
  phone:              z.string().max(50).optional().nullable(),
  email:              z.string().max(200).optional().nullable(),
  website:            z.string().max(300).optional().nullable(),
  client_type:        z.string().max(100).optional().nullable(),
  target_demographic: z.string().max(500).optional().nullable(),
  values:             z.string().max(2000).optional().nullable(),
  services:           z.string().max(2000).optional().nullable(),
  brand_voice:        z.string().max(2000).optional().nullable(),
  sign_off:           z.string().max(300).optional().nullable(),
  // extra is a NOT NULL JSONB column — must be present on first INSERT
  extra:              z.record(z.string(), z.unknown()).optional().default({}),
});

export const POST = withAuth(async (req, { user }) => {
  // Admin-only: Company DNA feeds every AI answer, so writes are restricted
  // to client_admin / super_admin (VAs have read-only access in the UI).
  if (!["client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Only admins can edit Company DNA." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { client_id, ...fields } = parsed.data;
  const updatedAt = new Date().toISOString();

  // Check whether a row already exists for this client.
  // We do insert vs update explicitly rather than upsert so that:
  //   INSERT path: all non-null defaults (extra JSONB) are provided
  //   UPDATE path: only the fields the user actually submitted are written —
  //                no risk of nulling out fields not present in this request
  const { data: existing } = await admin
    .from("company_dna")
    .select("id")
    .eq("client_id", client_id)
    .maybeSingle();

  let data, error;

  if (existing) {
    // Row exists — update only the submitted fields
    ({ data, error } = await admin
      .from("company_dna")
      .update({ ...fields, updated_at: updatedAt })
      .eq("client_id", client_id)
      .select()
      .single());
  } else {
    // No row yet — insert with all required columns including extra
    ({ data, error } = await admin
      .from("company_dna")
      .insert({ client_id, ...fields, extra: fields.extra ?? {}, updated_at: updatedAt })
      .select()
      .single());
  }

  if (error) {
    console.error("[company-dna POST] DB error:", error.code, error.message, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
});
