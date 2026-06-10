/**
 * POST /api/vault/gaps — gap workflow actions.
 * action "dismiss": mark matching unanswered query-log rows dismissed (noise).
 * (Answering a gap goes through /api/vault/teach, which closes it.)
 * Admins only — gap curation is a governance action.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  action: z.literal("dismiss"),
});

export const POST = withAuth(
  async (req, { user }) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

    const access = assertClientAccess(user, parsed.data.clientId);
    if (access) return access;

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("vault_queries")
      .update({ dismissed: true })
      .eq("client_id", parsed.data.clientId)
      .eq("answered", false)
      .ilike("question", parsed.data.question.trim());

    if (error) {
      console.error("[vault/gaps]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  },
  { roles: ["client_admin", "super_admin"] },
);
