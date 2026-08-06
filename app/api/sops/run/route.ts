/**
 * POST  /api/sops/run   { sopId, stepsTotal } — record that a VA started running
 *   a SOP (logged on first real interaction). Returns { id }.
 * PATCH /api/sops/run   { id, stepsDone, completed } — update progress/completion.
 *
 * Best-effort usage tracking — any authenticated user; failures must never break
 * the runner, so the client calls these without surfacing errors.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/api/with-auth";

const startSchema = z.object({ sopId: z.string().uuid(), stepsTotal: z.number().int().min(0).max(1000) });
const patchSchema = z.object({
  id: z.string().uuid(),
  stepsDone: z.number().int().min(0).max(1000),
  completed: z.boolean(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  // Pin the version the VA actually ran, for an accurate audit trail. Only a SOP
  // the caller can actually see may be referenced: a global SOP (client_id null)
  // or one in their own client — never a foreign tenant's SOP (which would leak
  // its version and pollute the caller's run analytics with a foreign sop_id).
  const { data: sop } = await admin.from("sops").select("version, client_id, visibility").eq("id", parsed.data.sopId).maybeSingle();
  const sopRow = sop as { version: number; client_id: string | null; visibility: string | null } | null;
  if (!sopRow || (sopRow.client_id !== null && sopRow.client_id !== user.client_id && user.role !== "super_admin")) {
    return NextResponse.json({ error: "SOP not found." }, { status: 404 });
  }
  // Restricted SOPs are visible only to granted VAs (sop_access). Don't let a VA
  // record a run — and pollute analytics — for a restricted SOP they can't see.
  if (sopRow.visibility === "restricted" && user.role === "va") {
    const { data: grant } = await admin
      .from("sop_access")
      .select("sop_id")
      .eq("sop_id", parsed.data.sopId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!grant) return NextResponse.json({ error: "SOP not found." }, { status: 404 });
  }
  const sopVersion = sopRow.version ?? null;

  const { data, error } = await admin
    .from("sop_runs")
    .insert({
      sop_id: parsed.data.sopId,
      client_id: user.client_id,
      user_id: user.id,
      status: "started",
      steps_total: parsed.data.stepsTotal,
      sop_version: sopVersion,
    })
    .select("id")
    .single();

  if (error) return serverError(error);
  return NextResponse.json({ id: data?.id }, { status: 201 });
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("sop_runs")
    .update({
      steps_done: parsed.data.stepsDone,
      status: parsed.data.completed ? "completed" : "started",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id); // a user can only update their own run

  if (error) return serverError(error);
  return NextResponse.json({ success: true });
});
