import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { placementTemplates } from "./templates";

/**
 * Seed a placement's Notebook with the starter templates. Idempotent: does
 * nothing if the placement already has pages. Uses the service role to write
 * the templates because the seeding admin is NOT a placement participant and
 * would (correctly) be blocked by RLS — this is the one place the service role
 * touches notebook tables, and only to WRITE system defaults, never to read
 * participant content back.
 */
export async function seedPlacementNotebook(placementId: string): Promise<number> {
  const admin = createAdminClient();

  const { count } = await admin
    .from("notebook_pages")
    .select("id", { count: "exact", head: true })
    .eq("placement_id", placementId);
  if ((count ?? 0) > 0) return 0; // already seeded

  let created = 0;
  let sort = 0;
  for (const tpl of placementTemplates()) {
    const { data: parent, error } = await admin
      .from("notebook_pages")
      .insert({ placement_id: placementId, title: tpl.title, content: tpl.content as Json, sort_order: sort++ })
      .select("id")
      .single();
    if (error || !parent) { console.warn("[notebook seed] parent failed", tpl.title, error?.message); continue; }
    created++;

    let childSort = 0;
    for (const child of tpl.children ?? []) {
      const { error: cErr } = await admin
        .from("notebook_pages")
        .insert({ placement_id: placementId, parent_page_id: parent.id, title: child.title, content: child.content as Json, sort_order: childSort++ });
      if (cErr) console.warn("[notebook seed] child failed", child.title, cErr.message);
      else created++;
    }
  }
  return created;
}
