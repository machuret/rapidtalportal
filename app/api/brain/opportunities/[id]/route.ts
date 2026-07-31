import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  clientId: z.string().uuid(),
  action: z.enum(["approve", "dismiss", "start", "complete", "reopen", "measure"]),
  outcome: z.object({
    note: z.string().trim().max(2_000).optional(),
    baseline: z.string().trim().max(1_000).optional(),
    result: z.string().trim().max(1_000).optional(),
    effectivenessStatus: z.enum([
      "unmeasured", "measuring", "effective", "mixed", "ineffective",
    ]).optional(),
  }).default({}),
});

export const PATCH = withAuth<{ id: string }>(async (req, { user, params }) => {
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid opportunity." }, { status: 422 });
  }
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid opportunity action." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { error } = await admin.rpc("transition_brain_opportunity", {
    p_opportunity_id: parsedParams.data.id,
    p_client_id: parsed.data.clientId,
    p_action: parsed.data.action,
    p_actor_id: user.id,
    p_outcome: parsed.data.outcome,
  });
  if (error) {
    const invalidTransition = /Invalid opportunity transition/iu.test(error.message);
    return NextResponse.json({
      error: invalidTransition
        ? "That opportunity has already changed. Refresh and try again."
        : "The opportunity could not be updated.",
      recoverable: true,
    }, { status: invalidTransition ? 409 : 503 });
  }

  const { data, error: readError } = await admin
    .from("brain_opportunities")
    .select(
      "id,client_id,diagnostic_run_id,brain_context_snapshot_id,kind,title,summary,rationale,recommended_action,impact,effort,priority_score,source_layers,company_provenance,library_provenance,status,effectiveness_status,outcome,approved_at,started_at,completed_at,measured_at,created_at,updated_at",
    )
    .eq("id", parsedParams.data.id)
    .eq("client_id", parsed.data.clientId)
    .single();
  if (readError || !data) {
    return NextResponse.json({
      error: "The opportunity changed but its latest state could not be reloaded.",
      recoverable: true,
    }, { status: 503 });
  }
  return NextResponse.json({ opportunity: data });
}, { roles: ["client_admin", "super_admin"] });
