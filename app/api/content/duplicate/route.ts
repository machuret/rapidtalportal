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
  const { data: source, error } = await admin
    .from("content_pieces")
    .select("project_id,content_type,title,brief,body,content_brief,source_references,style_snapshot")
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error || !source) return NextResponse.json({ error: error?.message ?? "Content not found." }, { status: 404 });

  const title = `Copy of ${source.title}`.slice(0, 300);
  // Supabase's generated client cannot infer the newly introduced migration
  // until production types are refreshed.
  const db = admin;
  const persistence = source.project_id
    ? db
      .rpc("create_content_project_derived_draft", {
        p_client_id: parsed.data.client_id,
        p_project_id: source.project_id,
        p_parent_piece_id: parsed.data.id,
        p_actor_id: user.id,
        p_content_type: source.content_type,
        p_title: title,
        p_body: source.body,
        p_content_brief: source.content_brief,
        p_source_references: source.source_references,
        p_style_snapshot: source.style_snapshot,
        p_generation_kind: "duplicate",
      })
      .single()
    : db
      .from("content_pieces")
      .insert({
        client_id: parsed.data.client_id,
        project_id: null,
        content_type: source.content_type,
        title,
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
      .select("id,project_id,content_type,title,status,generation_kind,parent_piece_id,created_at")
      .single();
  const { data, error: insertError } = await persistence;
  if (insertError) {
    const status = insertError.code === "42501"
      ? 403
      : insertError.code === "P0002"
        ? 404
        : insertError.code === "P0001" || insertError.code === "22023"
          ? 422
          : 500;
    return NextResponse.json({
      error: status === 500 ? "The duplicate could not be saved." : insertError.message,
    }, { status });
  }
  return NextResponse.json(data, { status: 201 });
});
