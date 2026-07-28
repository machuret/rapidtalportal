import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContentStudio } from "@/components/content/ContentStudio";
import { PageIntro } from "@/components/layout/PageIntro";
import type { ContentPiece, ContentTopic } from "@/types/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content — RapidTal" };

export default async function ContentPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: history }, { data: topics }, { data: brandStyle }] = await Promise.all([
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
      .select("brand_voice, content_style, internal_rules, sign_off, preferred_terms, prohibited_terms, emoji_policy, humour_policy, spelling_locale, default_cta_style, approved_claims, prohibited_claims, channel_styles")
      .eq("client_id", user.client_id)
      .maybeSingle(),
  ]);

  // VAs run this tool end-to-end; client and super admins retain approval too.
  const canApprove = ["va", "client_admin", "super_admin"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content Creation</h1>
      <p className="text-zinc-400 text-sm mb-8">
        AI-powered drafts grounded in your Vault and Company DNA.
      </p>
      <PageIntro id="content" />
      <ContentStudio
        clientId={user.client_id}
        canApprove={canApprove}
        brandStyle={(brandStyle ?? {}) as Record<string, unknown>}
        history={(history ?? []) as ContentPiece[]}
        topics={(topics ?? []) as ContentTopic[]}
      />
    </div>
  );
}
