/**
 * Reorder / re-parent pages after a sidebar drag. Updates sort_order and
 * parent_page_id only (no content change → no revision, no activity). Enforces
 * the depth-1 rule. User-scoped client → RLS confines edits to the caller's
 * own placement pages.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    sortOrder: z.number().int().min(0).max(100000),
    parentPageId: z.string().uuid().nullable(),
  })).min(1).max(500),
});

export const POST = withAuth(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const sb = createClient();
  const { items } = parsed.data;

  // A target parent must itself be top-level.
  const newParents = Array.from(new Set(items.map((i) => i.parentPageId).filter(Boolean))) as string[];
  if (newParents.length) {
    const { data: parents } = await sb.from("notebook_pages").select("id, parent_page_id").in("id", newParents);
    if ((parents ?? []).some((p) => (p as { parent_page_id: string | null }).parent_page_id)) {
      return NextResponse.json({ error: "Pages can only be nested one level deep." }, { status: 422 });
    }
  }
  // A page that has children cannot become a child itself.
  const becomingChild = items.filter((i) => i.parentPageId).map((i) => i.id);
  if (becomingChild.length) {
    const { data: kids } = await sb.from("notebook_pages").select("id").in("parent_page_id", becomingChild).limit(1);
    if ((kids ?? []).length) {
      return NextResponse.json({ error: "Move or archive sub-pages before nesting this page." }, { status: 422 });
    }
  }

  await Promise.all(items.map((i) =>
    sb.from("notebook_pages").update({ sort_order: i.sortOrder, parent_page_id: i.parentPageId }).eq("id", i.id),
  ));

  return NextResponse.json({ ok: true });
});
