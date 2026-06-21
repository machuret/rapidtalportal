/**
 * Server-side guide resolution: admin-edited row (guides) ?? code default,
 * mirroring lib/prompts/server.ts. A short in-memory TTL cache keeps the
 * /guide page near-zero DB cost while letting admin edits go live within ~30s
 * (instantly on the instance that saved). The built-in CLIENT_GUIDE / VA_GUIDE
 * remain the seed + fallback, so the guides work before anything is saved and
 * if the DB read ever fails.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIENT_GUIDE, GUIDE_INTRO, type GuideGroup } from "@/lib/client-guide";
import { VA_GUIDE, VA_GUIDE_INTRO } from "@/lib/va-guide";

export type GuideKey = "client" | "va";

/** The full editable shape stored per audience: a top intro + the groups. */
export interface GuideDoc {
  intro: string;
  groups: GuideGroup[];
}

/** Code defaults — the seed for the editor and the fallback when no row/DB. */
export const GUIDE_DEFAULTS: Record<GuideKey, GuideDoc> = {
  client: { intro: GUIDE_INTRO, groups: CLIENT_GUIDE },
  va: { intro: VA_GUIDE_INTRO, groups: VA_GUIDE },
};

const TTL_MS = 30_000;
const cache = new Map<GuideKey, { doc: GuideDoc | null; at: number }>();

/** The active guide for an audience: admin edit if saved, else the code default. */
export async function getGuideDoc(key: GuideKey): Promise<GuideDoc> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.doc ?? GUIDE_DEFAULTS[key];

  let doc: GuideDoc | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("guides").select("data").eq("key", key).maybeSingle();
    doc = (data as { data: GuideDoc } | null)?.data ?? null;
  } catch {
    doc = null; // never let a guide read take the page down
  }
  cache.set(key, { doc, at: Date.now() });
  return doc ?? GUIDE_DEFAULTS[key];
}

/** Called by the admin guides API after a save/reset. */
export function bustGuideCache(key?: GuideKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}
