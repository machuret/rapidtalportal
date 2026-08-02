/**
 * POST /api/vault/index-batch — on-demand "index everything unindexed" for one
 * client. Body: { clientId }.
 *
 * Replaces the old browser-side orchestration, which fanned out N sequential
 * /reprocess calls from VaultClient and silently aborted when the user
 * navigated away. The work now runs server-side with the exact same candidate
 * selection (ready/error + stale processing, dead-lettered after 24h) and
 * batched multi-round triggering as the vault-index cron — see
 * lib/vault/index-runner.ts. The 15-min cron remains the guarantee; this just
 * lets a signed-in user force a pass immediately.
 *
 * Returns { processed, remaining } — items triggered this run, and how many of
 * them still need embeddings after it (the cron will keep picking those up).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultUploadLimiter, tooManyRequests } from "@/lib/rate-limit";
import { runVaultIndexSweep } from "@/lib/vault/index-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // same budget as the cron — a backlog can take a while

const schema = z.object({ clientId: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  // Same limiter as vault ingestion: every triggered item fans out into paid
  // embedding work, so a hammered button must not run up an unbounded bill.
  const rl = await vaultUploadLimiter.check(`index-batch:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  }
  const { clientId } = parsed.data;

  const accessError = assertClientAccess(user, clientId);
  if (accessError) return accessError;

  const { candidates, remaining } = await runVaultIndexSweep(createAdminClient(), { clientId });
  return NextResponse.json({ processed: candidates, remaining });
});
