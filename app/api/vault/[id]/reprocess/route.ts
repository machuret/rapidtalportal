/**
 * POST /api/vault/[id]/reprocess — Trigger vault-process edge function on an existing item.
 * Re-runs AI extraction to refresh ai_summary, category, and tags.
 * Auth: withAuth — any authenticated user with client access.
 */

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { z } from "zod";

// rebuild=true clears existing chunks and re-embeds from scratch (manual
// "re-run AI" / content edit). Default false = resume: keep finished chunks and
// only embed what's missing, so the backfill makes incremental progress.
const schema = z.object({ clientId: z.string().uuid(), rebuild: z.boolean().optional().default(false) });

export const POST = withAuth<{ id: string }>(async (req, { user, params }) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  return proxyToEdgeFunction("vault-process", {
    itemId: params.id,
    clientId: parsed.data.clientId,
    rebuild: parsed.data.rebuild,
  });
});
