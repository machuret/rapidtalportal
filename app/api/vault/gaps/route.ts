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
      .from("brain_knowledge_gaps")
      .select("id,normalized_topic,example_questions")
      .eq("client_id", parsed.data.clientId)
      .in("status", ["open", "in_review"]);
    lookup = parsed.data.gapId
      ? lookup.eq("id", parsed.data.gapId)
      : lookup.contains("example_questions", [parsed.data.question!.trim()]);
    const { data: gap, error: gapError } = await lookup
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (gapError) return serverError(gapError);
    if (!gap) {
      return NextResponse.json({ error: "Knowledge gap not found or already closed." }, { status: 404 });
    }

    if (parsed.data.action === "resolve") {
      const { data: query, error: queryError } = await db
        .from("vault_queries")
        .select("id")
        .eq("client_id", parsed.data.clientId)
        .eq("brain_gap_id", gap.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (queryError) return serverError(queryError);
      if (!query) {
        return NextResponse.json({ error: "No source question is linked to this gap." }, { status: 409 });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await db.rpc("resolve_vault_gap_with_item", {
        p_gap_id: query.id,
        p_client_id: parsed.data.clientId,
        p_actor_id: user.id,
        p_vault_item_id: parsed.data.vaultItemId,
      });
      if (error) return serverError(error);
      return NextResponse.json({ success: true });
    }

    const updates = parsed.data.action === "dismiss"
      ? { status: "dismissed" }
      : parsed.data.action === "claim"
        ? { status: "in_review", owner_id: user.id }
        : {
            importance: parsed.data.importance,
            recommended_source: parsed.data.recommendedSource,
          };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateQuery = db
      .from("brain_knowledge_gaps")
      .update(updates)
      .eq("client_id", parsed.data.clientId)
      .eq("id", gap.id);
    const { error } = await updateQuery;

    if (error) {
      console.error("[vault/gaps]", error.message);
      return serverError(error);
    }
    const queryUpdates = parsed.data.action === "dismiss"
      ? { gap_status: "dismissed", dismissed: true, answered: false }
      : parsed.data.action === "claim"
        ? { gap_status: "in_review", owner_id: user.id }
        : {
            gap_importance: parsed.data.importance,
            recommended_source: parsed.data.recommendedSource,
          };
    const { error: queryUpdateError } = await db
      .from("vault_queries")
      .update(queryUpdates)
      .eq("client_id", parsed.data.clientId)
      .eq("brain_gap_id", gap.id);
    if (queryUpdateError) return serverError(queryUpdateError);
    return NextResponse.json({ success: true });
  },
  { roles: ["client_admin", "super_admin"] },
);
