/**
 * POST /api/vault/gaps — gap workflow actions.
 * action "dismiss": mark matching unanswered query-log rows dismissed (noise).
 * (Answering a gap goes through /api/vault/teach, which closes it.)
 * Admins only — gap curation is a governance action.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const base = z.object({
  clientId: z.string().uuid(),
  gapId: z.string().uuid().optional(),
  question: z.string().min(1).max(2000).optional(),
});
const schema = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("dismiss") }),
  base.extend({ action: z.literal("claim") }),
  base.extend({
    action: z.literal("update"),
    importance: z.enum(["low", "normal", "high", "critical"]),
    recommendedSource: z.string().trim().max(500).nullable(),
  }),
  base.extend({
    action: z.literal("resolve"),
    vaultItemId: z.string().uuid(),
  }),
]).superRefine((value, ctx) => {
  if (!value.gapId && !value.question) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gapId"],
      message: "A gap identifier or question is required.",
    });
  }
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
    // vault_queries workflow columns follow the generated schema snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    let lookup = db
      .from("vault_queries")
      .select("id,gap_key,question")
      .eq("client_id", parsed.data.clientId)
      .in("gap_status", ["open", "in_review"]);
    lookup = parsed.data.gapId
      ? lookup.eq("id", parsed.data.gapId)
      : lookup.ilike("question", parsed.data.question!.trim());
    const { data: gap, error: gapError } = await lookup
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gapError) return serverError(gapError);
    if (!gap) {
      return NextResponse.json({ error: "Knowledge gap not found or already closed." }, { status: 404 });
    }

    if (parsed.data.action === "resolve") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await db.rpc("resolve_vault_gap_with_item", {
        p_gap_id: gap.id,
        p_client_id: parsed.data.clientId,
        p_actor_id: user.id,
        p_vault_item_id: parsed.data.vaultItemId,
      });
      if (error) return serverError(error);
      return NextResponse.json({ success: true });
    }

    const updates = parsed.data.action === "dismiss"
      ? { gap_status: "dismissed", dismissed: true, answered: false }
      : parsed.data.action === "claim"
        ? { gap_status: "in_review", owner_id: user.id }
        : {
            gap_importance: parsed.data.importance,
            recommended_source: parsed.data.recommendedSource,
          };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateQuery = db
      .from("vault_queries")
      .update(updates)
      .eq("client_id", parsed.data.clientId);
    updateQuery = gap.gap_key
      ? updateQuery.eq("gap_key", gap.gap_key)
      : updateQuery.ilike("question", gap.question);
    const { error } = await updateQuery;

    if (error) {
      console.error("[vault/gaps]", error.message);
      return serverError(error);
    }
    return NextResponse.json({ success: true });
  },
  { roles: ["client_admin", "super_admin"] },
);
