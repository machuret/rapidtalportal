import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContentStudio } from "@/components/content/ContentStudio";
import { PageIntro } from "@/components/layout/PageIntro";
import type { ContentPiece, ContentProject, ContentTopic } from "@/types/content";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content — RapidTal" };

export default async function ContentPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  // content_style_analyses is service-role-only; page auth has already fixed
  // the client boundary before this server-side read.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const results = await Promise.all([
    admin
      .from("content_pieces")
      .select("id, content_type, title, status, created_at")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false })
      .limit(51),
    admin
      .from("content_topics")
      .select("id, title, description, content_type, status, created_at, created_by, brain_context_snapshot_id")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false }),
    admin
      .from("company_dna")
      .select("brand_voice, content_style, internal_rules, sign_off, preferred_terms, prohibited_terms, emoji_policy, humour_policy, spelling_locale, default_cta_style, approved_claims, prohibited_claims, channel_styles, hard_rules")
      .eq("client_id", user.client_id)
      .maybeSingle(),
    db
      .from("content_style_analyses")
      .select("id,channel,analysis,source_item_ids,analysed_at,approved_at")
      .eq("client_id", user.client_id)
      .eq("status", "approved"),
    admin
      .from("content_projects")
      .select("id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,brain_context_snapshot_id,created_at,updated_at")
      .eq("client_id", user.client_id)
      .order("updated_at", { ascending: false })
      .limit(201),
    admin
      .from("vault_queries")
      .select("question,answered,dismissed,created_at")
      .eq("client_id", user.client_id)
      .eq("answered", false)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[content page] initial data load failed", failed.error);
    throw new Error(
      "Content Studio could not load your saved work. Nothing has been deleted; please try again.",
    );
  }
  const [
    { data: history },
    { data: topics },
    { data: brandStyle },
    { data: styleAnalyses },
    { data: projects },
    { data: vaultQueries },
  ] = results;
  const styleAnalysisProfiles = Object.fromEntries(
    ((styleAnalyses ?? []) as Array<{ channel: string }>).map((profile) => [profile.channel, profile]),
  );
  const initialHistory = (history ?? []) as ContentPiece[];
  const initialProjects = (projects ?? []) as unknown as ContentProject[];

  // VAs can prepare and validate drafts; final approval remains a client/admin decision.
  const canApprove = hasContentCapability(user.role, "approve_content");
  const vaultGaps = Array.from(new Set(
    ((vaultQueries ?? []) as Array<{ question: string }>)
      .map((query) => query.question.trim())
      .filter(Boolean),
  )).slice(0, 12);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content Studio</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Move from a grounded idea to an approved, channel-ready artifact in one workflow.
      </p>
      <PageIntro id="content" />
      <ContentStudio
        clientId={user.client_id}
        viewerUserId={user.id}
        canApprove={canApprove}
        canManageCompetitors={hasContentCapability(user.role, "manage_competitors")}
        brandStyle={{
          ...((brandStyle ?? {}) as Record<string, unknown>),
          style_analysis_profiles: styleAnalysisProfiles,
        }}
        history={initialHistory.slice(0, 50)}
        historyHasMore={initialHistory.length > 50}
        topics={(topics ?? []) as ContentTopic[]}
        projects={initialProjects.slice(0, 200)}
        projectsHasMore={initialProjects.length > 200}
        vaultGaps={vaultGaps}
      />
    </div>
  );
}
