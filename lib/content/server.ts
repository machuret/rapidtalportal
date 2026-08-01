/**
 * Server-side data loaders for the Content Studio sub-pages. Each page loads
 * only what it renders (the old monolith loaded all six datasets everywhere).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentPiece, ContentProject, ContentTopic } from "@/types/content";

type Admin = SupabaseClient;

/** brandStyle + approved style-analysis profiles, keyed by channel. */
export async function loadBrandStyle(admin: Admin, clientId: string) {
  // content_style_analyses is service-role-only; page auth fixes the client
  // boundary before this server-side read.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const [{ data: brandStyle, error: styleError }, { data: styleAnalyses, error: analysesError }] = await Promise.all([
    admin
      .from("company_dna")
      .select("brand_voice, content_style, internal_rules, sign_off, preferred_terms, prohibited_terms, emoji_policy, humour_policy, spelling_locale, default_cta_style, approved_claims, prohibited_claims, channel_styles, hard_rules")
      .eq("client_id", clientId)
      .maybeSingle(),
    db
      .from("content_style_analyses")
      .select("id,channel,analysis,source_item_ids,analysed_at,approved_at")
      .eq("client_id", clientId)
      .eq("status", "approved"),
  ]);
  if (styleError) throw styleError;
  if (analysesError) throw analysesError;
  const styleAnalysisProfiles = Object.fromEntries(
    ((styleAnalyses ?? []) as Array<{ channel: string }>).map((profile) => [profile.channel, profile]),
  );
  return {
    ...((brandStyle ?? {}) as Record<string, unknown>),
    style_analysis_profiles: styleAnalysisProfiles,
  };
}

export async function loadProjects(admin: Admin, clientId: string, limit = 201) {
  const { data, error } = await admin
    .from("content_projects")
    .select("id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,brain_context_snapshot_id,created_at,updated_at")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const projects = (data ?? []) as unknown as ContentProject[];
  return { projects: projects.slice(0, limit - 1), hasMore: projects.length > limit - 1 };
}

export async function loadTopics(admin: Admin, clientId: string) {
  const { data, error } = await admin
    .from("content_topics")
    .select("id, title, description, content_type, status, created_at, created_by, brain_context_snapshot_id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContentTopic[];
}

export async function loadHistory(admin: Admin, clientId: string, limit = 51) {
  const { data, error } = await admin
    .from("content_pieces")
    .select("id, content_type, title, status, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const history = (data ?? []) as ContentPiece[];
  return { history: history.slice(0, limit - 1), hasMore: history.length > limit - 1 };
}

export async function loadVaultGaps(admin: Admin, clientId: string) {
  const { data, error } = await admin
    .from("vault_queries")
    .select("question,answered,dismissed,created_at")
    .eq("client_id", clientId)
    .neq("visibility", "private_coach")
    .eq("answered", false)
    .eq("dismissed", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return Array.from(new Set(
    ((data ?? []) as Array<{ question: string }>)
      .map((query) => query.question.trim())
      .filter(Boolean),
  )).slice(0, 12);
}
