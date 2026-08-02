import type { ContentBrief } from "@/types/content";
import {
  createContentStyleSnapshot,
  resolveContentStyle,
} from "@/supabase/functions/_shared/content-style";

/** Resolve and freeze the exact approved Company DNA/channel style for a project. */
export async function loadProjectStyleSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  clientId: string,
  channel: string,
  brief: ContentBrief,
) {
  const [
    { data: dna, error: dnaError },
    { data: styleProfile, error: styleError },
  ] = await Promise.all([
    db
      .from("company_dna")
      .select("updated_at,internal_rules,brand_voice,content_style,sign_off,preferred_terms,prohibited_terms,emoji_policy,humour_policy,spelling_locale,default_cta_style,approved_claims,prohibited_claims,channel_styles,hard_rules")
      .eq("client_id", clientId)
      .maybeSingle(),
    db
      .from("content_style_analyses")
      .select("id,channel,analysis,source_item_ids,source_evidence,analysed_at,approved_at")
      .eq("client_id", clientId)
      .eq("channel", channel)
      .eq("status", "approved")
      .maybeSingle(),
  ]);
  if (dnaError) throw dnaError;
  if (styleError) throw styleError;
  const resolvedDna = {
    ...(dna ?? {}),
    style_analysis_profiles: styleProfile ? { [channel]: styleProfile } : {},
  };
  const style = resolveContentStyle(
    resolvedDna,
    channel,
    brief.tone,
    brief.length === "short"
      ? "Keep it brief and punchy."
      : brief.length === "long"
        ? "Be comprehensive and detailed."
        : "Use a standard length for the format.",
  );
  return createContentStyleSnapshot(
    style,
    channel,
    typeof dna?.updated_at === "string" ? dna.updated_at : null,
  );
}
