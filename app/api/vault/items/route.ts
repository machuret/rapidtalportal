/**
 * GET /api/vault/items — paginated, server-side searchable Vault list.
 *
 * Replaces the "load all 100 items then filter in the browser" pattern. Search
 * runs against the Postgres full-text index (020_vault_search.sql); category and
 * status filters and pagination all run server-side so it scales per-tenant.
 *
 * Query params: clientId (required), q, category, status, page (0-based), limit.
 * Returns: { items, page, nextPage, counts }.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { isVaultCategory } from "@/lib/taxonomy/vault-categories";

const COLS =
  "id, client_id, source_type, title, source_url, storage_path, status, error_message, created_at, created_by, category, tags, ai_summary, updated_at, updated_by";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

export const GET = withAuth(async (req, { user }) => {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });

  const access = assertClientAccess(user, clientId);
  if (access) return access;

  const q = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));

  const admin = createAdminClient();

  let query = admin.from("vault_items").select(COLS).eq("client_id", clientId);
  if (category && isVaultCategory(category)) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  if (q) query = query.textSearch("fts", q, { type: "websearch", config: "english" });

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (error) {
    console.error("[vault/items GET]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data ?? [];

  // Status counts for the stats strip (fast via the (client_id, status) index).
  const countFor = async (s?: string) => {
    let cq = admin.from("vault_items").select("id", { count: "exact", head: true }).eq("client_id", clientId);
    if (s) cq = cq.eq("status", s);
    const { count } = await cq;
    return count ?? 0;
  };
  const [total, ready, processing, pending, errored] = await Promise.all([
    countFor(), countFor("ready"), countFor("processing"), countFor("pending"), countFor("error"),
  ]);

  return NextResponse.json({
    items,
    page,
    nextPage: items.length === limit ? page + 1 : null,
    counts: { total, ready, processing: processing + pending, error: errored },
  });
});
