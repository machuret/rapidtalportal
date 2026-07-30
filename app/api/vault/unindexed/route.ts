/**
 * GET /api/vault/unindexed?clientId=... — list ready/error items that have NO
 * embeddings yet (no rows in vault_chunks). Used by the "Index for AI search"
 * backfill button so Ask the Vault has something to search. 'error' items are
 * included so a previously-failed run can be retried in one click.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

export const GET = withAuth(async (req, { user }) => {
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });

  const access = assertClientAccess(user, clientId);
  if (access) return access;

  const admin = createAdminClient();

  // Candidates = ready/error docs not yet FULLY indexed. vault-process sets
  // indexed_at only when every chunk is embedded, so `indexed_at IS NULL`
  // covers never-indexed AND partially-indexed docs — the button is then a
  // complete substitute for the cron sweep (each click = one resume pass),
  // which matters on Vercel plans where sub-daily crons aren't available.
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const [
    { data: items, error },
    { data: stuckItems, error: stuckError },
    { count: total },
  ] = await Promise.all([
    admin
      .from("vault_items")
      .select("id")
      .eq("client_id", clientId)
      .in("status", ["ready", "error"])
      .is("indexed_at", null),
    admin
      .from("vault_items")
      .select("id")
      .eq("client_id", clientId)
      .in("status", ["pending", "processing"])
      .lt("updated_at", staleBefore),
    admin
      .from("vault_items")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .in("status", ["ready", "error"]),
  ]);
  if (error) return serverError(error);
  if (stuckError) return serverError(stuckError);

  const itemIds = [...new Set([
    ...(items ?? []).map((i) => (i as { id: string }).id),
    ...(stuckItems ?? []).map((i) => (i as { id: string }).id),
  ])];
  return NextResponse.json({
    itemIds,
    total: total ?? itemIds.length,
    indexed: (total ?? itemIds.length) - itemIds.length,
  });
});
