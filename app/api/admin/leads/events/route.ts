/**
 * Lead activity timeline. Super-admin only.
 * GET  ?leadId= — events newest first.
 * POST          — log a note / call / email / meeting.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuperAdmin } from "@/lib/api/with-auth";

export const GET = withSuperAdmin(async (req) => {
  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId || !z.string().uuid().safeParse(leadId).success) {
    return NextResponse.json({ error: "leadId required." }, { status: 422 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_events").select("id, lead_id, user_id, kind, body, created_at")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
});

const schema = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(["note", "call", "email", "meeting"]).default("note"),
  body: z.string().min(1).max(8000),
});

export const POST = withSuperAdmin(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("lead_events").insert({
    lead_id: parsed.data.leadId, user_id: user.id, kind: parsed.data.kind, body: parsed.data.body.trim(),
  }).select("id, lead_id, user_id, kind, body, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
});
