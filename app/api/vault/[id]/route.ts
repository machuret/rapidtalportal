/**
 * GET /api/vault/[id] — fetch one vault item including raw_content.
 *
 * The list endpoint intentionally omits raw_content (payload size), so the
 * edit drawer and the row preview fetch the document on demand. Without this
 * route the drawer's Content field always opened empty — and saving replaced
 * the whole document with whatever was typed.
 *
 * PATCH /api/vault/[id] — Update a vault item's title, content, category, tags.
 *
 * After saving, fires vault-process in the background (non-blocking) to refresh
 * AI metadata (ai_summary, category, tags). The HTTP response returns immediately
 * after the DB write — the UI receives a live update via Supabase Realtime when
 * vault-process completes and writes back to vault_items.
 *
 * Auth: withAuth — read: any user with client access; write: client_admin or creator.
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

export const GET = withAuth<{ id: string }>(async (req, { user, params }) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vault_items")
    .select("id, client_id, title, raw_content, source_url, source_type, updated_at")
    .eq("id", params.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return serverError(error, { userId: user.id, clientId });
  if (!data) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  return NextResponse.json(data);
});

const patchSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  raw_content: z.string().min(1).max(500000).optional(),
  category: z.enum(VAULT_CATEGORY_KEYS).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  authority_level: z.enum(["authoritative", "supporting"]).optional(),
  knowledge_status: z.enum(["active", "review_required", "superseded"]).optional(),
  time_sensitive: z.boolean().optional(),
  valid_from: z.string().date().nullable().optional(),
  valid_until: z.string().date().nullable().optional(),
  review_due_at: z.string().date().nullable().optional(),
  supersedes_item_id: z.string().uuid().nullable().optional(),
  has_conflict: z.boolean().optional(),
  conflict_note: z.string().trim().max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.valid_from && value.valid_until && value.valid_until < value.valid_from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valid_until"],
      message: "The valid-until date cannot be before the valid-from date.",
    });
  }
  if (value.has_conflict && !value.conflict_note?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conflict_note"],
      message: "Describe the conflict so another editor can resolve it.",
    });
  }
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
  const { data: existing, error: existingError } = await supabase
    .from("vault_items")
    .select("id, client_id, created_by")
    .eq("id", params.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (existingError) return serverError(existingError, { userId: user.id, clientId });

  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  // Only client_admin or the original creator can edit
  const isCreator = (existing as { created_by: string | null }).created_by === user.id;
  if (user.role !== "client_admin" && user.role !== "super_admin" && !isCreator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const governanceFields = [
    "authority_level",
    "knowledge_status",
    "time_sensitive",
    "valid_from",
    "valid_until",
    "review_due_at",
    "supersedes_item_id",
    "has_conflict",
    "conflict_note",
  ] as const;
  const governing = governanceFields.some((field) => updates[field] !== undefined);
  if (governing && user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only client administrators can govern source authority and lifecycle." },
      { status: 403 },
    );
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
      // Content changed → embeddings must be rebuilt. Mark not-yet-indexed so
      // the cron sweep finishes the job if the fire-and-forget call below is
      // dropped — otherwise stale embeddings would be served forever.
      ...(updates.raw_content ? { indexed_at: null } : {}),
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
