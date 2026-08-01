import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const suggestionSchema = z.object({
  clientId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  topic: z.string().trim().min(3).max(500),
  detail: z.string().trim().max(2000).optional().default(""),
  consent: z.literal(true),
});

export const POST = withAuth(async (request, { user, impersonating }) => {
  if (impersonating) {
    return NextResponse.json(
      { error: "Library suggestions are unavailable while viewing as another user." },
      { status: 409 },
    );
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = suggestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Explicit consent and a valid topic are required." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  // The snapshot proves that this suggestion came from the signed-in owner's
  // private Coach turn. A user cannot submit another person's question.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 140 precedes generated types
  const db = createAdminClient() as any;
  const snapshot = await db.from("brain_context_snapshots")
    .select("id,created_by,snapshot")
    .eq("id", parsed.data.snapshotId)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (snapshot.error) return serverError(snapshot.error);
  if (!snapshot.data || snapshot.data.created_by !== user.id) {
    return NextResponse.json({ error: "Private Coach snapshot not found." }, { status: 404 });
  }
  const actor = snapshot.data.snapshot?.request?.actor;
  if (actor?.conversationVisibility !== "private_coach") {
    return NextResponse.json({ error: "Only private Coach topics can be suggested here." }, { status: 409 });
  }

  const existing = await db.from("business_library_gap_suggestions")
    .select("id,status,created_at")
    .eq("brain_context_snapshot_id", parsed.data.snapshotId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (existing.error) return serverError(existing.error);
  if (existing.data) {
    return NextResponse.json({ suggestion: existing.data, replayed: true });
  }

  const coachRole = user.role === "va" ? "va" : "client";
  const result = await db.from("business_library_gap_suggestions").insert({
    client_id: parsed.data.clientId,
    owner_id: user.id,
    brain_context_snapshot_id: parsed.data.snapshotId,
    coach_role: coachRole,
    topic: parsed.data.topic,
    detail: parsed.data.detail,
    consented_at: new Date().toISOString(),
  }).select("id,status,created_at").single();
  if (result.error?.code === "23505") {
    const replay = await db.from("business_library_gap_suggestions")
      .select("id,status,created_at")
      .eq("brain_context_snapshot_id", parsed.data.snapshotId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!replay.error && replay.data) {
      return NextResponse.json({ suggestion: replay.data, replayed: true });
    }
  }
  if (result.error) return serverError(result.error);
  return NextResponse.json({ suggestion: result.data }, { status: 201 });
}, { roles: ["client_admin", "va"] });
