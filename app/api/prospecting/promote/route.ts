import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api/errors";

const schema = z.object({
  clientId: z.string().uuid(),
  leadId: z.string().uuid(),
  selectedEmail: z.string().trim().email().max(320).nullable().optional(),
  selectedPhone: z.string().trim().min(5).max(50).nullable().optional(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const db = createAdminClient();
  const { data, error } = await db.rpc("promote_prospecting_lead_to_crm_v3", {
    p_campaign_lead_id: parsed.data.leadId,
    p_client_id: parsed.data.clientId,
    p_actor_id: user.id,
    p_selected_email: parsed.data.selectedEmail ?? null,
    p_selected_phone: parsed.data.selectedPhone ?? null,
  });
  if (error || !data) return serverError(error, { userId: user.id, clientId: parsed.data.clientId, url: req.nextUrl.pathname });
  return NextResponse.json({ contactId: data });
});
