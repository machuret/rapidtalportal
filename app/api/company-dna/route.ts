import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONTENT_HARD_RULE_TYPES } from "@/supabase/functions/_shared/content-style";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

const hardRuleSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(CONTENT_HARD_RULE_TYPES),
  value: z.string().trim().min(1).max(300).optional(),
  limit: z.number().int().min(0).max(50000).optional(),
  channels: z.array(z.enum([
    "email", "x", "linkedin", "facebook", "instagram",
    "newsletter", "blog", "message", "other",
  ])).max(12).optional().default([]),
}).superRefine((rule, ctx) => {
  const numeric = ["min_words", "max_words", "max_emojis"].includes(rule.type);
  if (numeric && rule.limit === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["limit"], message: "A numeric limit is required." });
  }
  if (!numeric && !rule.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "A phrase is required." });
  }
});

const bodySchema = z.object({
  client_id:          z.string().uuid(),
  company_name:       z.string().max(200).optional().nullable(),
  company_description:z.string().max(4000).optional().nullable(),
  founders:           z.string().max(500).optional().nullable(),
  location:           z.string().max(200).optional().nullable(),
  address:            z.string().max(1000).optional().nullable(),
  phone:              z.string().max(50).optional().nullable(),
  email:              z.string().max(200).optional().nullable(),
  website:            z.string().max(300).optional().nullable(),
  client_type:        z.string().max(100).optional().nullable(),
  target_demographic: z.string().max(500).optional().nullable(),
  values:             z.string().max(2000).optional().nullable(),
  services:           z.string().max(2000).optional().nullable(),
  brand_voice:        z.string().max(2000).optional().nullable(),
  sign_off:           z.string().max(300).optional().nullable(),
  // Brain profile fields (migration 068) — feed every AI surface.
  business_goals:     z.string().max(4000).optional().nullable(),
  marketing_goals:    z.string().max(4000).optional().nullable(),
  team:               z.string().max(4000).optional().nullable(),
  tools_used:         z.string().max(4000).optional().nullable(),
  website_content:    z.string().max(20000).optional().nullable(),
  content_style:      z.string().max(4000).optional().nullable(),
  internal_rules:     z.string().max(4000).optional().nullable(),
  // Deliberate content-style authority (migration 087). These rules are applied
  // before any per-draft tone request.
  preferred_terms:    z.string().max(4000).optional().nullable(),
  prohibited_terms:   z.string().max(4000).optional().nullable(),
  emoji_policy:       z.string().max(2000).optional().nullable(),
  humour_policy:      z.string().max(2000).optional().nullable(),
  spelling_locale:    z.string().max(200).optional().nullable(),
  default_cta_style:  z.string().max(2000).optional().nullable(),
  approved_claims:    z.string().max(6000).optional().nullable(),
  prohibited_claims:  z.string().max(6000).optional().nullable(),
  channel_styles:     z.record(z.string(), z.string().max(4000)).optional(),
  social_links:       z.record(z.string(), z.string().url().max(2000)).optional(),
  hard_rules:         z.array(hardRuleSchema).max(100).optional(),
  // Per-field auto-fill provenance (migration 146) — written back verbatim;
  // the form clears a field's entry as soon as a human edits it.
  field_provenance:   z.record(z.string(), z.object({
    source: z.enum(["scrape", "vault_draft"]),
    at: z.string().max(40),
  })).optional(),
  // extra is a NOT NULL JSONB column — must be present on first INSERT
  extra:              z.record(z.string(), z.unknown()).optional().default({}),
});

export const POST = withAuth(async (req, { user }) => {
  // Admin-only: Company DNA feeds every AI answer, so writes are restricted
  // to client_admin / super_admin (VAs have read-only access in the UI).
  if (!hasContentCapability(user.role, "edit_company_dna")) {
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
    return serverError(error);
  }
  return NextResponse.json(data);
});
