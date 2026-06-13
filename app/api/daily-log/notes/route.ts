import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  log_id: z.string().uuid(),
  body:   z.string().min(1).max(2000),
});

export const POST = withAuth(async (req, { user }) => {
  if (!user.client_id) return NextResponse.json({ error: "No client." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();

  // Verify the log belongs to this user's client before attaching a note
  const { data: ownerCheck } = await admin
    .from("daily_logs")
    .select("id")
    .eq("id", parsed.data.log_id)
    .eq("client_id", user.client_id)
    .maybeSingle();

  if (!ownerCheck) {
    return NextResponse.json({ error: "Log not found or access denied." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("daily_log_notes")
    .insert({
      log_id:    parsed.data.log_id,
      client_id: user.client_id,
      user_id:   user.id,
      body:      parsed.data.body,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
});

export const DELETE = withAuth(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (!user.client_id) return NextResponse.json({ error: "No client." }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("daily_log_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("client_id", user.client_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
