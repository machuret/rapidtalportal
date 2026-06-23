import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateSegmentTimes } from "@/lib/tasks/time-entry-validate";
import { z } from "zod";

// ── GET /api/time-entries?date=YYYY-MM-DD ──────────────────────────────────
// Returns all segments for the authenticated VA for the given date.
export const GET = withAuth(async (req, { user }) => {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("time_entries")
    .select("id, user_id, client_id, work_date, phase, started_at, ended_at, is_manual, notes, category")
    .eq("user_id", user.id)
    .eq("work_date", date)
    .order("started_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
});

// ── POST /api/time-entries ─────────────────────────────────────────────────
// Upsert a single segment. Supply { id? } to close an existing open segment.
const SegmentSchema = z.object({
  id:         z.string().uuid().optional(),
  work_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phase:      z.enum(["work", "break"]),
  started_at: z.string(),
  ended_at:   z.string().nullable().optional(),
  is_manual:  z.boolean().optional(),
  notes:      z.string().nullable().optional(),
  category:   z.string().optional(),
});

// ── DELETE /api/time-entries?id=<uuid> ─────────────────────────────────────
// Remove a single segment the VA flagged as wrong. Scoped to user.id so a VA
// can only ever delete their own time.
export const DELETE = withAuth(async (req, { user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "valid id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("time_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

export const POST = withAuth(async (req, { user }) => {
  if (!user.client_id) {
    return NextResponse.json({ error: "No client assigned" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SegmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { id, work_date, phase, started_at, ended_at, is_manual, notes, category } = parsed.data;

  // Reject non-parseable or backwards times — they silently corrupt every
  // hours rollup (Supervision / My Team / Reports) downstream.
  const timeError = validateSegmentTimes(started_at, ended_at);
  if (timeError) return NextResponse.json({ error: timeError }, { status: 422 });

  const admin = createAdminClient();

  if (id) {
    // Re-validate the close against the STORED start — not the client-supplied
    // started_at, which a caller could fake to slip a backwards ended_at past
    // the top-level check and corrupt every downstream hours rollup.
    const { data: existing } = await admin
      .from("time_entries").select("started_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Segment not found." }, { status: 404 });
    if (ended_at) {
      const closeError = validateSegmentTimes((existing as { started_at: string }).started_at, ended_at);
      if (closeError) return NextResponse.json({ error: closeError }, { status: 422 });
    }
    // Close (or update) an existing segment
    const { data, error } = await admin
      .from("time_entries")
      .update({
        ended_at: ended_at ?? null,
        notes: notes ?? null,
        category: category ?? "General"
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  } else {
    // Insert a new segment
    const { data, error } = await admin
      .from("time_entries")
      .insert({
        user_id: user.id,
        client_id: user.client_id,
        work_date,
        phase,
        started_at,
        ended_at: ended_at ?? null,
        is_manual: is_manual ?? false,
        notes: notes ?? null,
        category: category ?? "General",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  }
});
