import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { StylePageClient } from "@/components/content/StylePageClient";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content Style — RapidTal" };

export default async function ContentStyleRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canEdit = hasContentCapability(user.role, "edit_company_dna");
  const admin = createAdminClient();
  const [{ data: dna }, { data: goldenRows }] = await Promise.all([
    admin
      .from("company_dna")
      .select("social_links")
      .eq("client_id", user.client_id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- golden examples precede generated schema refresh
    (admin as any)
      .from("content_golden_examples")
      .select("channel")
      .eq("client_id", user.client_id)
      .eq("status", "approved")
      .eq("evaluation_permission", true),
  ]);
  const socialLinks = (dna as { social_links?: Record<string, string> } | null)?.social_links;
  const linkedInUrl = typeof socialLinks?.linkedin === "string" ? socialLinks.linkedin : "";

  const approvedByChannel: Record<string, number> = {};
  for (const row of (goldenRows ?? []) as { channel: string }[]) {
    approvedByChannel[row.channel] = (approvedByChannel[row.channel] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Content Style</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Teach the engine to write like {client?.name ?? "your company"} — add ideal posts, review the voice profile it builds, and every draft follows it.
        {!canEdit && " Read-only: ask your admin to make changes."}
      </p>
      <PageIntro id="content-style" />
      <StylePageClient
        clientId={user.client_id}
        clientName={client?.name ?? "your company"}
        canEdit={canEdit}
        linkedInUrl={linkedInUrl}
        approvedByChannel={approvedByChannel}
      />
    </div>
  );
}
