import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesUpdate } from "@/types/database";
import {
  isBrainMemoryScopeExpansion,
  normalizeBrainMemoryScope,
} from "@/supabase/functions/_shared/brain-memory-scope";

/** Curated Brain Memory — admins read it, pin/deactivate/delete to correct it. */

const querySchema = z.object({ client_id: z.string().uuid() });
const patchSchema = z.object({
  client_id: z.string().uuid(),
  id:        z.string().uuid(),
  active:    z.boolean().optional(),
  pinned:    z.boolean().optional(),
  content:   z.string().min(1).max(2000).optional(),
  status:    z.enum(["proposed", "active", "muted", "review_required"]).optional(),
  scope: z.object({
    surfaces: z.array(z.enum(["ask", "content", "compose", "tool"])).max(4).optional(),
    channels: z.array(z.enum(["linkedin", "facebook", "instagram", "email", "blog", "newsletter"])).max(6).optional(),
    contentTypes: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    audiences: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    objectives: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    global: z.boolean().optional(),
  }).optional(),
  conflict_action: z.enum(["keep_existing", "replace_existing", "merge", "narrow", "keep_both"]).optional(),
  resolution: z.record(z.string(), z.unknown()).optional(),
});
const deleteSchema = z.object({ client_id: z.string().uuid(), id: z.string().uuid() });

function adminOnly(role: string) {
  return role === "client_admin" || role === "super_admin";
}

export const GET = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ client_id: searchParams.get("client_id") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid client_id." }, { status: 400 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brain_memory")
    .select("id,kind,content,confidence,source_count,active,pinned,status,scope,created_at,first_observed_at,last_confirmed_at,approved_by,approved_at,contradiction_status,contradicts_memory_id,conflict_summary,lineage_complete")
    .eq("client_id", parsed.data.client_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[brain/memory GET]", error.code, error.message);
    return serverError(error);
  }
  const memories = (data ?? []) as Array<Record<string, unknown> & { id: string; approved_by?: string | null; contradicts_memory_id?: string | null }>;
  // Phase 2 tables are added by migration 122 and are not in the generated
  // Supabase type snapshot yet.
  const phaseTwoAdmin = admin;
  const memoryIds = memories.map((memory) => memory.id);
  const approverIds = Array.from(new Set(memories.flatMap((memory) =>
    typeof memory.approved_by === "string" ? [memory.approved_by] : []
  )));
  const [sourcesResult, approversResult] = await Promise.all([
    memoryIds.length
      ? phaseTwoAdmin.from("brain_memory_sources")
        .select("memory_id,signal_id,contribution,supporting_excerpt,supporting_excerpt_hash,created_at")
        .eq("client_id", parsed.data.client_id)
        .in("memory_id", memoryIds)
        .order("created_at", { ascending: true })
        .limit(3000)
      : Promise.resolve({ data: [], error: null }),
    approverIds.length
      ? phaseTwoAdmin.from("users").select("id,full_name,email").in("id", approverIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sourcesResult.error) return serverError(sourcesResult.error);
  if (approversResult.error) return serverError(approversResult.error);

  const signalIds = Array.from(new Set(
    (sourcesResult.data ?? []).map((source: { signal_id: string }) => source.signal_id),
  ));
  const { data: signals, error: signalsError } = signalIds.length
    ? await phaseTwoAdmin.from("brain_signals")
      .select("id,surface,context,created_at,user_id")
      .eq("client_id", parsed.data.client_id)
      .in("id", signalIds)
    : { data: [], error: null };
  if (signalsError) return serverError(signalsError);

  const signalById = new Map((signals ?? []).map((signal: { id: string }) => [signal.id, signal]));
  const approverById = new Map((approversResult.data ?? []).map((approver: { id: string }) => [approver.id, approver]));
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
  return NextResponse.json(memories.map((memory) => ({
    ...memory,
    scope: normalizeBrainMemoryScope(memory.scope),
    approved_by_user: typeof memory.approved_by === "string"
      ? approverById.get(memory.approved_by) ?? null
      : null,
    conflicting_memory: typeof memory.contradicts_memory_id === "string"
      ? memoryById.get(memory.contradicts_memory_id) ?? null
      : null,
    sources: (sourcesResult.data ?? [])
      .filter((source: { memory_id: string }) => source.memory_id === memory.id)
      .map((source: { signal_id: string }) => ({
        ...source,
        signal: signalById.get(source.signal_id) ?? null,
      })),
  })));
});

export const PATCH = withAuth(async (req, { user }) => {
  if (!adminOnly(user.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  if (parsed.data.conflict_action) {
    const { data, error } = await admin.rpc("resolve_brain_memory_conflict", {
      p_client_id: parsed.data.client_id,
      p_memory_id: parsed.data.id,
      p_action: parsed.data.conflict_action,
      p_actor_id: user.id,
      p_resolution: (parsed.data.resolution ?? {}) as Json,
    });
    if (error) return serverError(error);
    return NextResponse.json(data);
  }

  // Read the current row before deciding whether a scope change broadens the
  // lesson. Broadening can never silently change production behavior.
  const { data: current, error: currentError } = await admin
    .from("brain_memory")
    .select("scope,status,lineage_complete,contradiction_status")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (currentError) return serverError(currentError);

  const updates: TablesUpdate<"brain_memory"> = { updated_at: new Date().toISOString() };
  let scopeExpanded = false;
  if (parsed.data.pinned !== undefined) updates.pinned = parsed.data.pinned;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.scope !== undefined) {
    const scope = normalizeBrainMemoryScope(parsed.data.scope);
    if (!scope.global && !scope.surfaces?.length) {
      return NextResponse.json({ error: "A lesson needs a surface or explicit global scope." }, { status: 422 });
    }
    updates.scope = scope as Json;
    scopeExpanded = isBrainMemoryScopeExpansion(current.scope, scope);
    if (scopeExpanded) {
      updates.status = "proposed";
      updates.active = false;
      updates.approved_by = null;
      updates.approved_at = null;
    }
  }
  // status is the source of truth; keep the legacy `active` flag in sync so
  // readers (context, score, health) need no changes. Approving a proposed
  // lesson activates it; muting deactivates it.
  const requestedStatus = parsed.data.status ??
    (parsed.data.active === undefined ? undefined : parsed.data.active ? "active" : "muted");
  if (requestedStatus !== undefined) {
    updates.status = requestedStatus;
    updates.active = requestedStatus === "active";
    if (requestedStatus === "active") {
      if (scopeExpanded) {
        updates.status = "proposed";
        updates.active = false;
        updates.approved_by = null;
        updates.approved_at = null;
      } else {
      if (!current.lineage_complete) {
        return NextResponse.json({ error: "This legacy lesson has no exact evidence lineage and cannot be activated until reviewed with supporting feedback." }, { status: 409 });
      }
      if (current.contradiction_status === "open") {
        return NextResponse.json({ error: "Resolve the conflicting feedback before activating this lesson." }, { status: 409 });
      }
      updates.last_reinforced_at = new Date().toISOString();
      updates.last_confirmed_at = new Date().toISOString();
      updates.approved_by = user.id;
      updates.approved_at = new Date().toISOString();
      }
    }
  }

  const { data, error } = await admin
    .from("brain_memory")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select()
    .single();

  if (error) {
    console.error("[brain/memory PATCH]", error.code, error.message);
    return serverError(error);
  }
  return NextResponse.json(data);
});

export const DELETE = withAuth(async (req, { user }) => {
  if (!adminOnly(user.role)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { error } = await admin
    .from("brain_memory")
    .delete()
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id);

  if (error) {
    console.error("[brain/memory DELETE]", error.code, error.message);
    return serverError(error);
  }
  return NextResponse.json({ success: true });
});
