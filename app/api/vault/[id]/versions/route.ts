import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const GET = withAuth<{ id: string }>(async (req, { user, params }) => {
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  }
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin
    .from("vault_items")
    .select("id")
    .eq("id", params.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (itemError) return serverError(itemError);
  if (!item) return NextResponse.json({ error: "Source not found." }, { status: 404 });

  const { data, error } = await admin
    .from("vault_item_versions")
    .select("id,version_number,title,authority_level,knowledge_status,time_sensitive,valid_from,valid_until,review_due_at,has_conflict,conflict_note,captured_at,captured_by")
    .eq("client_id", clientId)
    .eq("item_id", params.id)
    .order("version_number", { ascending: false })
    .limit(20);
  if (error) return serverError(error);

  return NextResponse.json({ versions: data ?? [] });
});
