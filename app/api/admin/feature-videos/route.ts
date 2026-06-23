/**
 * /api/admin/feature-videos — per-feature tutorial videos (super_admin only).
 *
 * GET                       → every feature (slug + title) with its Loom URL.
 * PATCH {slug, loom_url}    → set/replace the video for a feature.
 * DELETE ?slug=             → remove a feature's video.
 *
 * Slugs are constrained to the known PageIntro features; URLs must be Loom
 * share/embed links. Edits go live within ~30s via the cache bust.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withSuperAdmin } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLoomUrl } from "@/lib/loom";
import { FEATURE_SLUGS, FEATURE_TITLES, bustFeatureVideoCache } from "@/lib/tutorials/server";

export const dynamic = "force-dynamic";

export const GET = withSuperAdmin(async () => {
  const admin = createAdminClient();
  const { data } = await admin.from("feature_videos").select("slug, loom_url, updated_at");
  const bySlug = new Map(((data ?? []) as { slug: string; loom_url: string; updated_at: string }[]).map((r) => [r.slug, r]));

  const features = FEATURE_SLUGS.map((slug) => ({
    slug,
    title: FEATURE_TITLES[slug] ?? slug,
    loomUrl: bySlug.get(slug)?.loom_url ?? null,
    updatedAt: bySlug.get(slug)?.updated_at ?? null,
  }));
  return NextResponse.json({ features });
});

const patchSchema = z.object({
  slug: z.string().min(1).max(100),
  loom_url: z.string().trim().min(1).max(500),
});

export const PATCH = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A feature and a video URL are required." }, { status: 422 });

  const { slug, loom_url } = parsed.data;
  if (!FEATURE_SLUGS.includes(slug)) return NextResponse.json({ error: "Unknown feature." }, { status: 404 });
  if (!isLoomUrl(loom_url)) return NextResponse.json({ error: "That doesn't look like a Loom link. Paste a loom.com share URL." }, { status: 422 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("feature_videos")
    .upsert({ slug, loom_url, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "slug" });
  if (error) return serverError(error);

  bustFeatureVideoCache();
  return NextResponse.json({ ok: true });
});

export const DELETE = withSuperAdmin(async (req) => {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug || !FEATURE_SLUGS.includes(slug)) return NextResponse.json({ error: "Unknown feature." }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin.from("feature_videos").delete().eq("slug", slug);
  if (error) return serverError(error);

  bustFeatureVideoCache();
  return NextResponse.json({ ok: true });
});
