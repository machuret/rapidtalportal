import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { StylePageClient } from "@/components/content/StylePageClient";
import { DnaForm } from "@/components/dna/DnaForm";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company voice — RapidTal" };

export default async function ContentStyleRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canEdit = hasContentCapability(user.role, "edit_company_dna");
  const admin = createAdminClient();
  const [dnaResult, goldenResult, analysisResult, sourceResult] = await Promise.all([
    admin
      .from("company_dna")
      .select("*")
      .eq("client_id", user.client_id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- golden examples precede generated schema refresh
    (admin as any)
      .from("content_golden_examples")
      .select("channel,content_hash")
      .eq("client_id", user.client_id)
      .eq("status", "approved")
      .eq("evaluation_permission", true),
    admin
      .from("content_style_analyses")
      .select("channel")
      .eq("client_id", user.client_id)
      .eq("status", "approved"),
    admin
      .from("vault_items")
      .select("tags,content_hash")
      .eq("client_id", user.client_id)
      .eq("evidence_role", "style_example")
      .eq("knowledge_status", "active")
      .eq("status", "ready")
      .or(`review_due_at.is.null,review_due_at.gt.${new Date().toISOString().slice(0, 10)}`)
      .limit(500),
  ]);
  if (dnaResult.error) throw dnaResult.error;
  if (goldenResult.error) throw goldenResult.error;
  if (analysisResult.error) throw analysisResult.error;
  if (sourceResult.error) throw sourceResult.error;
  const dna = dnaResult.data;
  const goldenRows = goldenResult.data;
  const approvedAnalyses = analysisResult.data;
  const socialLinks = (dna as { social_links?: Record<string, string> } | null)?.social_links;
  const linkedInUrl = typeof socialLinks?.linkedin === "string" ? socialLinks.linkedin : "";

  const approvedByChannel: Record<string, number> = {};
  const usableHashesByChannel: Record<string, Set<string>> = {};
  for (const row of (goldenRows ?? []) as Array<{ channel: string; content_hash: string }>) {
    approvedByChannel[row.channel] = (approvedByChannel[row.channel] ?? 0) + 1;
    usableHashesByChannel[row.channel] ??= new Set<string>();
    usableHashesByChannel[row.channel].add(row.content_hash);
  }
  for (const row of (sourceResult.data ?? []) as Array<{ tags: string[] | null; content_hash: string | null }>) {
    if (!row.content_hash) continue;
    for (const tag of row.tags ?? []) {
      if (["linkedin", "facebook", "instagram", "x", "email", "blog", "newsletter"].includes(tag)) {
        usableHashesByChannel[tag] ??= new Set<string>();
        usableHashesByChannel[tag].add(row.content_hash);
      }
    }
  }
  const usableByChannel = Object.fromEntries(
    Object.entries(usableHashesByChannel).map(([channel, hashes]) => [channel, hashes.size]),
  );
  const channelStyles = dna?.channel_styles && typeof dna.channel_styles === "object"
    ? Object.values(dna.channel_styles as Record<string, unknown>)
    : [];
  const hasDeclaredVoice = Boolean(
    dna?.brand_voice?.trim() ||
    dna?.content_style?.trim() ||
    channelStyles.some((value) => typeof value === "string" && value.trim()) ||
    (Array.isArray(dna?.hard_rules) && dna.hard_rules.length > 0),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Company voice</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Show RapidTal how {client?.name ?? "your company"} should sound, then review and approve the voice used in future drafts.
        {!canEdit && " Read-only: ask your admin to make changes."}
      </p>
      <PageIntro id="content-style" />
      <StylePageClient
        clientId={user.client_id}
        clientName={client?.name ?? "your company"}
        canEdit={canEdit}
        linkedInUrl={linkedInUrl}
        approvedByChannel={approvedByChannel}
        usableByChannel={usableByChannel}
        hasDeclaredVoice={hasDeclaredVoice}
        approvedAnalysisChannels={[
          ...new Set((approvedAnalyses ?? []).map((row) => row.channel)),
        ]}
        voiceSettings={(
          <DnaForm
            initialData={dna}
            clientId={user.client_id}
            readOnly={!canEdit}
            sectionMode="voice"
          />
        )}
      />
    </div>
  );
}
