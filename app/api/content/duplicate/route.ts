import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
});

export const POST = withAuth(async (req, { user }) => {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: source, error } = await (admin as any)
    .from("content_pieces")
    .select("content_type,title,brief,body,content_brief,source_references,style_snapshot")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error || !source) return NextResponse.json({ error: error?.message ?? "Content not found." }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: insertError } = await (admin as any)
    .from("content_pieces")
    .insert({
      client_id: parsed.data.client_id,
      content_type: source.content_type,
      title: `Copy of ${source.title}`.slice(0, 300),
      brief: source.brief,
      body: source.body,
      content_brief: source.content_brief,
      source_references: source.source_references,
      style_snapshot: source.style_snapshot,
      parent_piece_id: parsed.data.id,
      generation_kind: "duplicate",
      status: "draft",
      created_by: user.id,
    })
    .select("id,content_type,title,status,generation_kind,parent_piece_id,created_at")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
});
