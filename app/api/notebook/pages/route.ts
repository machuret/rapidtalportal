/**
 * Notebook pages CRUD.
 * POST  — create a page (depth-1 nesting enforced).
 * PATCH — save content/title (optimistic-concurrency via expectedUpdatedAt →
 *         409 "stale" if the other party edited underneath) OR archive/restore.
 *
 * SECURITY: every query uses the USER-scoped Supabase client so RLS decides
 * access. The service role is never used here, so an admin (non-participant)
 * gets zero rows / forbidden — content stays invisible to RapidTal.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withAuth } from "@/lib/api/with-auth";
import type { Database, Json } from "@/types/database";

const SELECT = "id, placement_id, parent_page_id, title, content, sort_order, created_by, last_edited_by, is_archived, created_at, updated_at";

export const GET = withAuth(async (req) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "id required." }, { status: 422 });
  }
  const sb = await createClient();
  const { data } = await sb.from("notebook_pages").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(data);
});

const createSchema = z.object({
  placementId: z.string().uuid(),
  parentPageId: z.string().uuid().nullable().optional(),
  title: z.string().max(300).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(300).optional(),
  content: z.unknown().optional(),
  expectedUpdatedAt: z.string().optional(),
  isArchived: z.boolean().optional(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const sb = await createClient();

  // Enforce one level of nesting: a parent must itself be top-level.
  if (parsed.data.parentPageId) {
    const { data: parent } = await sb
      .from("notebook_pages")
      .select("id, parent_page_id, placement_id")
      .eq("id", parsed.data.parentPageId)
      .maybeSingle();
    const pr = parent as { parent_page_id: string | null; placement_id: string } | null;
    if (!pr) return NextResponse.json({ error: "Parent page not found." }, { status: 404 });
    if (pr.placement_id !== parsed.data.placementId) {
      return NextResponse.json({ error: "Parent belongs to a different placement." }, { status: 422 });
    }
    if (pr.parent_page_id) {
      return NextResponse.json({ error: "Pages can only be nested one level deep." }, { status: 422 });
    }
  }

  // Place new page at the end of its level.
  const levelQuery = sb
    .from("notebook_pages")
    .select("sort_order")
    .eq("placement_id", parsed.data.placementId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const { data: siblings } = parsed.data.parentPageId
    ? await levelQuery.eq("parent_page_id", parsed.data.parentPageId)
    : await levelQuery.is("parent_page_id", null);
  const sortOrder = ((siblings?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;

  const { data, error } = await sb
    .from("notebook_pages")
    .insert({
      placement_id: parsed.data.placementId,
      parent_page_id: parsed.data.parentPageId ?? null,
      title: parsed.data.title?.trim() || "New page",
      content: { type: "doc", content: [{ type: "paragraph" }] } as Json,
      sort_order: sortOrder,
      created_by: user.id,
      last_edited_by: user.id,
    })
    .select(SELECT)
    .single();

  // RLS rejection surfaces as an error / null — treat as forbidden.
  if (error || !data) return NextResponse.json({ error: "Couldn't create the page." }, { status: 403 });
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 422 });

  const sb = await createClient();
  const now = new Date().toISOString();

  // ---- Archive / restore (no stale check needed) ----
  if (parsed.data.isArchived !== undefined && parsed.data.content === undefined && parsed.data.title === undefined) {
    const { data, error } = await sb
      .from("notebook_pages")
      .update({ is_archived: parsed.data.isArchived, last_edited_by: user.id, updated_at: now })
      .eq("id", parsed.data.id)
      .select(SELECT)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(data);
  }

  // ---- Content / title save with optimistic concurrency ----
  if (!parsed.data.expectedUpdatedAt) {
    return NextResponse.json({ error: "expectedUpdatedAt is required for content saves." }, { status: 422 });
  }
  const updates: Database["public"]["Tables"]["notebook_pages"]["Update"] = { last_edited_by: user.id, updated_at: now };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim() || "New page";
  if (parsed.data.content !== undefined) updates.content = parsed.data.content as Json;

  const { data, error } = await sb
    .from("notebook_pages")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("updated_at", parsed.data.expectedUpdatedAt)
    .select(SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  if (!data) {
    // Either the page moved on (stale) or we can't see it (forbidden/deleted).
    const { data: current } = await sb
      .from("notebook_pages").select("updated_at").eq("id", parsed.data.id).maybeSingle();
    if (current) {
      return NextResponse.json(
        { error: "stale", currentUpdatedAt: (current as { updated_at: string }).updated_at },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(data);
});
