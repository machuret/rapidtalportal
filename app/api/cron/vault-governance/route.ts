/**
 * Vault governance sweep, driven by Vercel Cron (see vercel.json, daily 03:45).
 *
 * Retrieval already excludes sources whose governance window has passed
 * (valid_until / review_due_at), but nothing transitioned their state or told
 * anyone — expired knowledge silently stayed 'active' forever. This cron:
 *
 *   (a) UPDATE vault_items SET knowledge_status = 'review_required'
 *       WHERE knowledge_status = 'active'
 *         AND (review_due_at < now() OR valid_until < now())
 *
 *   (b) notifies each affected client's admins ONCE per run (type
 *       'vault_review', href /vault) with how many sources need review.
 *
 * Idempotency / no-spam: the `knowledge_status = 'active'` predicate makes
 * every transition one-shot — an item is counted exactly once, on the run
 * where it first goes stale. A client only appears in the transitioned set
 * when it has NEWLY expired sources this run, so "notify only when the count
 * changed since last run" reduces to "notify when this run transitioned > 0";
 * no cross-run state is needed in the heartbeat detail.
 *
 * Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron requests.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientAdminIds, notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // (a) Transition newly-stale sources. `.select()` returns the updated rows so
  // the same statement doubles as the per-client count — no second query.
  const { data: transitioned, error } = await admin
    .from("vault_items")
    .update({ knowledge_status: "review_required" })
    .eq("knowledge_status", "active")
    .or(`review_due_at.lt.${now},valid_until.lt.${now}`)
    .select("id, client_id");

  if (error) {
    return NextResponse.json({
      error: "Vault governance sweep failed.",
      recoverable: true,
    }, { status: 503 });
  }

  // (b) One notification per client with fresh transitions.
  const perClient = new Map<string, number>();
  for (const row of (transitioned ?? []) as Array<{ id: string; client_id: string }>) {
    perClient.set(row.client_id, (perClient.get(row.client_id) ?? 0) + 1);
  }

  let notified = 0;
  for (const [clientId, count] of perClient) {
    const recipientIds = await clientAdminIds(clientId);
    if (recipientIds.length === 0) continue;
    await notify(recipientIds, {
      clientId,
      type: "vault_review",
      title: `${count} vault source${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} review`,
      href: "/vault",
    });
    notified += recipientIds.length;
  }

  const transitionedCount = transitioned?.length ?? 0;
  await admin.from("cron_heartbeats").upsert({
    name: "vault-governance",
    ran_at: now,
    detail: { transitioned: transitionedCount, clients: perClient.size, notified },
  });

  return NextResponse.json({
    ok: true,
    transitioned: transitionedCount,
    clients: perClient.size,
  });
}
