/**
 * Page revision history.
 * GET  ?pageId= — list snapshots (metadata only, newest first).
 * POST          — restore a revision's content as the current page content
 *                 (which itself writes a fresh revision via the DB trigger).
 *
 * User-scoped client → RLS gates everything to placement participants.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withAuth } from "@/lib/api/with-auth";
import type { Json } from "@/types/database";

const PAGE_SELECT = "id, placement_id, parent_page_id, title, content, sort_order, created_by, last_edited_by, is_archived, created_at, updated_at";

export const GET = withAuth(async (req) => {
  const pageId = req.nextUrl.searchParams.get("pageId");
  if (!pageId || !z.string().uuid().safeParse(pageId).success) {
    return NextResponse.json({ error: "pageId required." }, { status: 422 });
  }
  const sb = await createClient();
  const { data, error } = await sb
    .from("notebook_page_revisions")
    .select("id, page_id, title, content, edited_by, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return serverError(error);
  return NextResponse.json(data ?? []);
});

const restoreSchema = z.object({ pageId: z.string().uuid(), revisionId: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const sb = await createClient();
  const { data: rev } = await sb
    .from("notebook_page_revisions")
    .select("content, title, page_id")
    .eq("id", parsed.data.revisionId)
    .eq("page_id", parsed.data.pageId)
    .maybeSingle();
  if (!rev) return NextResponse.json({ error: "Revision not found." }, { status: 404 });

  const r = rev as { content: Json; title: string };
  const { data, error } = await sb
    .from("notebook_pages")
    .update({ content: r.content, title: r.title, last_edited_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.pageId)
    .select(PAGE_SELECT)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Couldn't restore." }, { status: 403 });
  return NextResponse.json(data);
});
