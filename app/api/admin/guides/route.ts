/**
 * /api/admin/guides — the editable Client and VA guides (super_admin only).
 *
 * GET ?key=client|va   → the active guide doc + the code default (for reset).
 * PATCH {key, data}    → save an edited guide doc.
 * DELETE ?key=         → reset a guide to the built-in code default.
 *
 * `data` is the full { intro, groups } document; per-item `video` must be a
 * Loom link when present. Edits go live within ~30s via the cache bust.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLoomUrl } from "@/lib/loom";
import { GUIDE_DEFAULTS, bustGuideCache, type GuideKey } from "@/lib/guides/server";

export const dynamic = "force-dynamic";

const keySchema = z.enum(["client", "va"]);

const videoField = z
  .string()
  .max(500)
  .optional()
  .refine((v) => !v || isLoomUrl(v), { message: "Each section video must be a Loom link." });

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  what: z.string().max(4000),
  why: z.string().max(4000),
  can: z.array(z.string().max(1000)),
  how: z.array(z.string().max(1000)),
  tip: z.string().max(2000).optional(),
  video: videoField,
});

const groupSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  blurb: z.string().max(1000).optional(),
  items: z.array(itemSchema),
});

const docSchema = z.object({
  intro: z.string().max(8000),
  groups: z.array(groupSchema).max(50),
});

const patchSchema = z.object({ key: keySchema, data: docSchema });

export const GET = withSuperAdmin(async (req) => {
  const key = keySchema.safeParse(req.nextUrl.searchParams.get("key"));
  if (!key.success) return NextResponse.json({ error: "Unknown guide." }, { status: 404 });

  const admin = createAdminClient();
  const { data } = await admin.from("guides").select("data, updated_at").eq("key", key.data).maybeSingle();
  const row = data as { data: unknown; updated_at: string } | null;

  return NextResponse.json({
    doc: row?.data ?? GUIDE_DEFAULTS[key.data],
    isCustom: !!row,
    updatedAt: row?.updated_at ?? null,
    default: GUIDE_DEFAULTS[key.data],
  });
});

export const PATCH = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid guide content." }, { status: 422 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("guides")
    .upsert({ key: parsed.data.key, data: parsed.data.data, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  bustGuideCache(parsed.data.key);
  return NextResponse.json({ ok: true });
});

export const DELETE = withSuperAdmin(async (req) => {
  const key = keySchema.safeParse(req.nextUrl.searchParams.get("key"));
  if (!key.success) return NextResponse.json({ error: "Unknown guide." }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin.from("guides").delete().eq("key", key.data as GuideKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  bustGuideCache(key.data);
  return NextResponse.json({ ok: true });
});
