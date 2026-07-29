import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  client_id: z.string().uuid(),
  piece_id: z.string().uuid(),
});

export const GET = withAuth(async (req, { user }) => {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    client_id: url.searchParams.get("client_id"),
    piece_id: url.searchParams.get("piece_id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_piece_revisions")
    .select("id,revision_number,title,body,content_type,reason,created_by,created_at")
    .eq("piece_id", parsed.data.piece_id)
    .eq("client_id", parsed.data.client_id)
    .order("revision_number", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
});
