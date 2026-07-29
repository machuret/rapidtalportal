import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContentStudio } from "@/components/content/ContentStudio";
import { PageIntro } from "@/components/layout/PageIntro";
import type { ContentPiece, ContentProject, ContentTopic } from "@/types/content";

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
  const [
    { data: history },
    { data: topics },
    { data: brandStyle },
    { data: styleAnalyses },
    { data: projects },
  ] = await Promise.all([
    admin
      .from("content_pieces")
      .select("id, content_type, title, status, created_at")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("content_topics")
      .select("id, title, description, content_type, status, created_at, created_by")
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
      .select("id,client_id,title,status,current_step,idea_snapshot,content_brief,vault_source_ids,vault_source_references,competitor_signals,style_snapshot,current_piece_id,created_at,updated_at")
      .eq("client_id", user.client_id)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  const styleAnalysisProfiles = Object.fromEntries(
    ((styleAnalyses ?? []) as Array<{ channel: string }>).map((profile) => [profile.channel, profile]),
  );

  // VAs run this tool end-to-end; client and super admins retain approval too.
  const canApprove = ["va", "client_admin", "super_admin"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content Studio</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Move from a grounded idea to an approved, channel-ready artifact in one workflow.
      </p>
      <PageIntro id="content" />
      <ContentStudio
        clientId={user.client_id}
        canApprove={canApprove}
        canManageCompetitors={["client_admin", "super_admin"].includes(user.role)}
        brandStyle={{
          ...((brandStyle ?? {}) as Record<string, unknown>),
          style_analysis_profiles: styleAnalysisProfiles,
        }}
        history={(history ?? []) as ContentPiece[]}
        topics={(topics ?? []) as ContentTopic[]}
        projects={(projects ?? []) as unknown as ContentProject[]}
      />
    </div>
  );
}
