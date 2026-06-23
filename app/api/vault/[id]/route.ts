/**
 * PATCH /api/vault/[id] — Update a vault item's title, content, category, tags.
 *
 * After saving, fires vault-process in the background (non-blocking) to refresh
 * AI metadata (ai_summary, category, tags). The HTTP response returns immediately
 * after the DB write — the UI receives a live update via Supabase Realtime when
 * vault-process completes and writes back to vault_items.
 *
 * Auth: withAuth — client_admin or item creator only.
 * Safeguards: Zod validation, assertClientAccess, created_by ownership check.
 */

import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { proxyToEdgeFunction } from "@/lib/edge-proxy";
import { VAULT_CATEGORY_KEYS } from "@/lib/taxonomy/vault-categories";
import { z } from "zod";

const patchSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  raw_content: z.string().min(1).max(500000).optional(),
  category: z.enum(VAULT_CATEGORY_KEYS).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const PATCH = withAuth<{ id: string }>(async (req, { user, params }) => {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { clientId, ...updates } = parsed.data;
  const accessError = assertClientAccess(user, clientId);
  if (accessError) return accessError;

  const supabase = createAdminClient();

  // Verify item exists and belongs to this client before updating
  const { data: existing } = await supabase
    .from("vault_items")
    .select("id, client_id, created_by")
    .eq("id", params.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  // Only client_admin or the original creator can edit
  const isCreator = (existing as { created_by: string | null }).created_by === user.id;
  if (user.role !== "client_admin" && user.role !== "super_admin" && !isCreator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // A human choosing category/tags is curation — mark it so vault-process
  // preserves these fields instead of overwriting them with AI values.
  const curating = updates.category !== undefined || updates.tags !== undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from("vault_items")
    .update({
      ...updates,
      ...(curating ? { meta_curated: true } : {}),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", params.id);

  if (updateErr) {
    return serverError(updateErr);
  }

  // Fire vault-process in the background — do NOT await.
  // The client sees the save immediately; Realtime pushes the AI metadata
  // update when vault-process writes its results back to vault_items.
  if (updates.raw_content) {
    // Content changed → rebuild embeddings from scratch (old chunks are stale).
    void proxyToEdgeFunction("vault-process", { itemId: params.id, clientId, rebuild: true })
      .catch(err => console.error("[vault/[id]] vault-process background error:", err));
  }

  return NextResponse.json({ success: true });
});
