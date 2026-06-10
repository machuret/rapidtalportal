/**
 * Golden questions — saved spot-checks for a client's Brain.
 * GET    ?clientId — list for a client.
 * POST   — add a question.
 * PATCH  — record a pass/fail result (appends to capped history).
 * DELETE — remove a question.
 * Admin-only (client_admin scoped to own client, super_admin any).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const ADMIN_ROLES = ["client_admin", "super_admin"];
const HISTORY_CAP = 20;
const SELECT = "id, client_id, question, last_status, last_checked_at, history, created_at";

const createSchema = z.object({ clientId: z.string().uuid(), question: z.string().min(5).max(500) });
const resultSchema = z.object({ id: z.string().uuid(), status: z.enum(["pass", "fail"]) });
const deleteSchema = z.object({ id: z.string().uuid() });

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("golden_questions").select(SELECT).eq("client_id", clientId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}, { roles: ADMIN_ROLES });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Question must be 5-500 characters." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("golden_questions")
    .insert({ client_id: parsed.data.clientId, question: parsed.data.question.trim(), created_by: user.id })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data }, { status: 201 });
}, { roles: ADMIN_ROLES });

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("golden_questions").select("id, client_id, history").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = existing as { client_id: string; history: { s: string; at: string }[] };
  const denied = assertClientAccess(user, row.client_id);
  if (denied) return denied;

  const now = new Date().toISOString();
  const history = [...(row.history ?? []), { s: parsed.data.status, at: now }].slice(-HISTORY_CAP);

  const { data, error } = await admin
    .from("golden_questions")
    .update({ last_status: parsed.data.status, last_checked_at: now, history })
    .eq("id", parsed.data.id)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}, { roles: ADMIN_ROLES });

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("golden_questions").select("id, client_id").eq("id", parsed.data.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const denied = assertClientAccess(user, (existing as { client_id: string }).client_id);
  if (denied) return denied;

  const { error } = await admin.from("golden_questions").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}, { roles: ADMIN_ROLES });
