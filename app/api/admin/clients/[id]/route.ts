import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/types/database";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const socialLinksSchema = z.object({
  linkedin: optionalText(2000),
  facebook: optionalText(2000),
  instagram: optionalText(2000),
  x: optionalText(2000),
  youtube: optionalText(2000),
}).strict().optional().default({});

const companyProfileSchema = z.object({
  company_name: optionalText(200),
  company_description: optionalText(4000),
  website: optionalText(2000),
  address: optionalText(1000),
  location: optionalText(500),
  phone: optionalText(100),
  email: z.string().trim().email().max(300).nullable().optional().or(z.literal("")),
  founders: optionalText(1000),
  client_type: optionalText(500),
  services: optionalText(6000),
  target_demographic: optionalText(4000),
  social_links: socialLinksSchema,
}).superRefine((profile, ctx) => {
  const urls: Array<[string, string | null | undefined, string[]]> = [
    ["website", profile.website, []],
    ["social_links.linkedin", profile.social_links.linkedin, ["linkedin.com"]],
    ["social_links.facebook", profile.social_links.facebook, ["facebook.com", "fb.com"]],
    ["social_links.instagram", profile.social_links.instagram, ["instagram.com"]],
    ["social_links.x", profile.social_links.x, ["x.com", "twitter.com"]],
    ["social_links.youtube", profile.social_links.youtube, ["youtube.com", "youtu.be"]],
  ];
  for (const [field, raw, hosts] of urls) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/^www\./u, "");
      if (url.protocol !== "https:" || (hosts.length && !hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)))) {
        throw new Error("invalid");
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: field.split("."),
        message: hosts.length ? "Enter a matching public HTTPS profile URL." : "Enter a public HTTPS URL.",
      });
    }
  }
});

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes").optional(),
  archived: z.boolean().optional(),
  content_pilot_enabled: z.boolean().optional(),
  company_profile: companyProfileSchema.optional(),
});

// PATCH /api/admin/clients/[id] — update client name/slug
export const PATCH = withSuperAdmin<{ id: string }>(async (req, { params, user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 422 });
  }

  const admin = createAdminClient();

  const { archived, content_pilot_enabled: pilotEnabled, company_profile: companyProfile, ...rest } = parsed.data;
  const updates: TablesUpdate<"clients"> = { ...rest };
  if (archived !== undefined) updates.archived_at = archived ? new Date().toISOString() : null;
  if (pilotEnabled !== undefined) {
    updates.content_pilot_enabled = pilotEnabled;
    updates.content_pilot_started_at = pilotEnabled ? new Date().toISOString() : null;
  }

  const db = admin;
  const clientQuery = Object.keys(updates).length
    ? db
      .from("clients")
      .update(updates)
      .eq("id", params.id)
      .select("id, name, slug, created_at, archived_at, content_pilot_enabled, content_pilot_started_at")
      .single()
    : db
      .from("clients")
      .select("id, name, slug, created_at, archived_at, content_pilot_enabled, content_pilot_started_at")
      .eq("id", params.id)
      .single();
  const { data, error } = await clientQuery;

  if (error) {
    console.error("[admin/clients PATCH]", error.code, error.message);
    if (error.code === "23505") {
      return NextResponse.json({ error: "Slug already exists." }, { status: 409 });
    }
    return serverError(error);
  }

  let profileVaultItemId: string | null = null;
  if (companyProfile) {
    const links = Object.fromEntries(
      Object.entries(companyProfile.social_links)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => [key, (value as string).trim()]),
    );
    const { data: itemId, error: profileError } = await db.rpc("sync_admin_company_profile", {
      p_client_id: params.id,
      p_actor_id: user.id,
      p_company_name: companyProfile.company_name ?? "",
      p_company_description: companyProfile.company_description ?? "",
      p_website: companyProfile.website ?? "",
      p_address: companyProfile.address ?? "",
      p_location: companyProfile.location ?? "",
      p_phone: companyProfile.phone ?? "",
      p_email: companyProfile.email ?? "",
      p_founders: companyProfile.founders ?? "",
      p_client_type: companyProfile.client_type ?? "",
      p_services: companyProfile.services ?? "",
      p_target_demographic: companyProfile.target_demographic ?? "",
      p_social_links: links,
    });
    if (profileError || !itemId) return serverError(profileError ?? new Error("Company profile sync failed."));
    profileVaultItemId = itemId as string;
    scheduleVaultProcess(profileVaultItemId, params.id);
  }

  return NextResponse.json({
    ...data,
    ...(companyProfile ? { company_profile: companyProfile } : {}),
    profile_vault_item_id: profileVaultItemId,
  });
});

// DELETE /api/admin/clients/[id] — delete client (cascades users)
export const DELETE = withSuperAdmin<{ id: string }>(async (_req, { params }) => {
  const admin = createAdminClient();

  // Collect this client's users BEFORE deleting the client. The FK cascade will
  // remove their public.users rows, but NOT their auth.users entries — leaving
  // ghost accounts that can still authenticate (→ "Profile not found") and whose
  // emails stay "taken". We delete those auth accounts explicitly.
  const { data: clientUsers } = await admin
    .from("users")
    .select("id")
    .eq("client_id", params.id);

  const { error } = await admin
    .from("clients")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[admin/clients DELETE]", error.code, error.message);
    return serverError(error);
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
});
