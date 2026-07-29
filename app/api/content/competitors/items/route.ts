import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  client_id: z.string().uuid(),
  competitor_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withAuth(async (req, { user }) => {
  const parsed = querySchema.safeParse({
    client_id: req.nextUrl.searchParams.get("client_id"),
    competitor_id: req.nextUrl.searchParams.get("competitor_id"),
    id: req.nextUrl.searchParams.get("id") || undefined,
    page: req.nextUrl.searchParams.get("page") ?? 0,
    limit: req.nextUrl.searchParams.get("limit") ?? 20,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid capture query." }, { status: 400 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  if (parsed.data.id) {
    const { data, error } = await db
      .from("competitor_content_items")
      .select("id, source_id, competitor_id, canonical_url, platform, content_type, title, raw_content, author, published_at, metadata, first_seen_at, last_seen_at, captured_at, is_removed")
      .eq("id", parsed.data.id)
      .eq("competitor_id", parsed.data.competitor_id)
      .eq("client_id", parsed.data.client_id)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return NextResponse.json({ error: "Captured item not found." }, { status: 404 });
    const { data: versions, error: versionsError } = await db
      .from("competitor_capture_versions")
      .select("id, content_hash, captured_at")
      .eq("item_id", data.id)
      .eq("competitor_id", parsed.data.competitor_id)
      .eq("client_id", parsed.data.client_id)
      .order("captured_at", { ascending: false })
      .limit(50);
    if (versionsError) return serverError(versionsError);
    return NextResponse.json({ item: data, versions: versions ?? [] });
  }

  const from = parsed.data.page * parsed.data.limit;
  const to = from + parsed.data.limit - 1;
  const { data, error, count } = await db
    .from("competitor_content_items")
    .select("id, source_id, competitor_id, canonical_url, platform, content_type, title, author, published_at, captured_at, is_removed", { count: "exact" })
    .eq("competitor_id", parsed.data.competitor_id)
    .eq("client_id", parsed.data.client_id)
    .order("captured_at", { ascending: false })
    .range(from, to);
  if (error) return serverError(error);
  return NextResponse.json({
    items: data ?? [],
    page: parsed.data.page,
    limit: parsed.data.limit,
    total: count ?? 0,
    has_more: to + 1 < (count ?? 0),
  });
});
