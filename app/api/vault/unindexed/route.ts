/**
 * GET /api/vault/unindexed?clientId=... — list ready/error items that have NO
 * embeddings yet (no rows in vault_chunks). Used by the "Index for AI search"
 * backfill button so Ask the Vault has something to search. 'error' items are
 * included so a previously-failed run can be retried in one click.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

export const GET = withAuth(async (req, { user }) => {
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });

  const access = assertClientAccess(user, clientId);
  if (access) return access;

  const admin = createAdminClient();

  // Ready items with substantive content are the embedding candidates.
  const { data: items, error } = await admin
    .from("vault_items")
    .select("id")
    .eq("client_id", clientId)
    // include 'error' too: items left in error by a previously-misconfigured
    // run still need indexing, and reprocessing clears the error.
    .in("status", ["ready", "error"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allIds = (items ?? []).map((i) => (i as { id: string }).id);
  if (allIds.length === 0) return NextResponse.json({ itemIds: [], total: 0, indexed: 0 });

  // Which of those already have chunks?
  const { data: chunkRows } = await admin
    .from("vault_chunks")
    .select("item_id")
    .eq("client_id", clientId);
  const indexedSet = new Set((chunkRows ?? []).map((c) => (c as { item_id: string }).item_id));

  const itemIds = allIds.filter((id) => !indexedSet.has(id));
  return NextResponse.json({
    itemIds,
    total: allIds.length,
    indexed: allIds.length - itemIds.length,
  });
});
