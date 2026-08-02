import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordWorkflowEvent,
  type PilotDbClient,
} from "@/lib/content/pilot-observability";
import {
  claimSupportFromDna,
  contentStructureWarnings,
  unsupportedClaimWarnings,
} from "@/supabase/functions/_shared/content-quality";
import {
  contentHardRuleWarnings,
  contentStyleWarnings,
  resolveContentStyle,
} from "@/supabase/functions/_shared/content-style";

const schema = z.object({
  client_id: z.string().uuid(),
  project_id: z.string().uuid(),
  piece_id: z.string().uuid(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const db = createAdminClient();
  const [
    { data: piece, error: pieceError },
    { data: dna, error: dnaError },
  ] = await Promise.all([
    db
      .from("content_pieces")
      .select("id,project_id,content_type,body,source_references,updated_at")
      .eq("id", parsed.data.piece_id)
      .eq("project_id", parsed.data.project_id)
      .eq("client_id", parsed.data.client_id)
      .maybeSingle(),
    db
      .from("company_dna")
      .select("company_name,company_description,values,services,target_demographic,location,address,website,social_links,business_goals,marketing_goals,team,tools_used,extra,internal_rules,brand_voice,content_style,sign_off,preferred_terms,prohibited_terms,emoji_policy,humour_policy,spelling_locale,default_cta_style,approved_claims,prohibited_claims,channel_styles,hard_rules")
      .eq("client_id", parsed.data.client_id)
      .maybeSingle(),
  ]);
  if (pieceError) return serverError(pieceError);
  if (dnaError) return serverError(dnaError);
  if (!piece) return NextResponse.json({ error: "Connected draft not found." }, { status: 404 });
  if (!dna) return NextResponse.json({ error: "Complete Company DNA before validation." }, { status: 422 });

  const { data: styleProfile, error: styleError } = await db
    .from("content_style_analyses")
    .select("id,channel,analysis,source_item_ids,analysed_at,approved_at")
    .eq("client_id", parsed.data.client_id)
    .eq("channel", piece.content_type)
    .eq("status", "approved")
    .maybeSingle();
  if (styleError) return serverError(styleError);
  const resolvedDna = {
    ...dna,
    style_analysis_profiles: styleProfile ? { [piece.content_type]: styleProfile } : {},
  };
  const style = resolveContentStyle(resolvedDna, piece.content_type, "Company-approved tone", "");
  const bodyText = piece.body ?? "";
  const hardRules = contentHardRuleWarnings(bodyText, style);
  const allStyle = contentStyleWarnings(bodyText, style);
  const styleOnly = allStyle.filter((warning) => !hardRules.includes(warning));
  const excerpts = Array.isArray(piece.source_references)
    ? piece.source_references.flatMap((source) => {
        if (!source || typeof source !== "object") return [];
        const excerpt = (source as Record<string, unknown>).excerpt;
        return typeof excerpt === "string" ? [excerpt] : [];
      })
    : [];
  const claims = unsupportedClaimWarnings(
    bodyText,
    claimSupportFromDna(resolvedDna, excerpts),
  );
  const platform = contentStructureWarnings(bodyText, piece.content_type);
  const checks = [
    { id: "claims", label: "Company facts from DNA and Vault", warnings: claims },
    { id: "style", label: "Company voice and style", warnings: styleOnly },
    { id: "platform", label: "Platform structure", warnings: platform },
    { id: "hard_rules", label: "Enforced hard rules", warnings: hardRules },
  ];
  const valid = checks.every((check) => check.warnings.length === 0);
  // Persist the verdict against the exact draft timestamp. The RPC locks the
  // project and rejects the write if the draft changed while checks ran.
  const { data: validation, error: validationError } = await db
    .rpc("record_content_project_validation", {
      p_client_id: parsed.data.client_id,
      p_project_id: parsed.data.project_id,
      p_piece_id: parsed.data.piece_id,
      p_actor_id: user.id,
      p_expected_piece_updated_at: piece.updated_at,
      p_passed: valid,
      p_checks: checks,
    })
    .single();
  if (validationError) {
    if (validationError.code === "40001") {
      return NextResponse.json({ error: validationError.message }, { status: 409 });
    }
    return serverError(validationError);
  }

  if (!valid) {
    await recordWorkflowEvent(db as unknown as PilotDbClient, {
      clientId: parsed.data.client_id,
      projectId: parsed.data.project_id,
      pieceId: parsed.data.piece_id,
      actorId: user.id,
      eventType: "validation_failed",
      stage: "validate",
      metadata: {
        failedChecks: checks
          .filter((check) => check.warnings.length > 0)
          .map((check) => check.id),
      },
    });
  }
  return NextResponse.json({
    valid,
    checks: checks.map((check) => ({
      ...check,
      passed: check.warnings.length === 0,
    })),
    validated_at: validation.validated_at,
  });
});
