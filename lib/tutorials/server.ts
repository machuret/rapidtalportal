/**
 * Server-side feature tutorial videos: the optional Loom video per feature
 * page (keyed by PageIntro slug). Loaded once per portal request, cached for
 * ~30s so an admin edit goes live within seconds. Read with the admin client
 * (these are global product help, not tenant data); shown to clients and VAs
 * behind the "Video Tutorial" button.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { PAGE_INTROS } from "@/lib/page-intros";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";

/** The features that can carry a tutorial video — the known PageIntro slugs. */
export const FEATURE_SLUGS = Object.keys(PAGE_INTROS);

/** Slug → friendly title, for the admin editor and the button label. */
export const FEATURE_TITLES: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_INTROS).map(([slug, copy]) => [slug, copy.title.replace(/^What (is|are) /, "").replace(/\?$/, "")]),
);

export type FeatureVideoMap = Record<string, string>;

const TTL_MS = 30_000;
let cache: { map: FeatureVideoMap; at: number } | null = null;

/** Map of slug → Loom URL for every feature that has a video set. */
export async function getFeatureVideos(): Promise<FeatureVideoMap> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;

  let map: FeatureVideoMap = {};
  try {
    const admin = createAdminClient();
    const { data } = await withPortalDataTimeout(
      (signal) => admin.from("feature_videos").select("slug, loom_url").abortSignal(signal),
      "Tutorial help",
      2_000,
    );
    map = Object.fromEntries(((data ?? []) as { slug: string; loom_url: string }[]).map((r) => [r.slug, r.loom_url]));
  } catch {
    map = {}; // never let a help lookup break the portal
  }
  cache = { map, at: Date.now() };
  return map;
}

/** Called by the admin feature-videos API after a save/clear. */
export function bustFeatureVideoCache(): void {
  cache = null;
}
