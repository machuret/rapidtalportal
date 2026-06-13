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
  // VA tool — clients drive this through their VA, not directly.
  if (user.role === "client_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: history }, { data: topics }] = await Promise.all([
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
  ]);

  // client_admin can no longer reach this VA tool; super_admin retains approval.
  const canApprove = user.role === "super_admin";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content Creation</h1>
      <p className="text-zinc-400 text-sm mb-8">
        AI-powered drafts grounded in your Vault and Company DNA.
      </p>
      <PageIntro id="content" />
      <ContentStudio
        clientId={user.client_id}
        userId={user.id}
        canApprove={canApprove}
        history={(history ?? []) as ContentPiece[]}
        topics={(topics ?? []) as ContentTopic[]}
      />
    </div>
  );
}
