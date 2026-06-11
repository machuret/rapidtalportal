import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KbList } from "@/components/kb/KbList";
import { PageIntro } from "@/components/layout/PageIntro";
import { VaultTabs } from "@/components/vault/VaultTabs";
import { Brain, BookOpen, Zap, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Q&A Knowledge — RapidTal" };

/**
 * The curated Q&A layer of the Business Brain — generated from Vault docs +
 * Company DNA, hand-editable, and retrieved by Ask the Vault at answer time.
 * Lives under /vault as a tab (formerly the standalone Knowledge Base page).
 */
export default async function VaultKnowledgePage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  // Use admin client for server-component reads: bypasses RLS entirely,
  // which prevents the current_user_role() recursion bug from returning
  // empty results even when entries exist in the database.
  const admin = createAdminClient();
  const [{ data: entries }, { data: lastRun }, { data: vaultItems }] = await Promise.all([
    admin
      .from("kb_entries")
      .select("id, question, answer, category, generated_at, source_vault_ids")
      .eq("client_id", user.client_id)
      .order("generated_at", { ascending: false }),
    admin
      .from("kb_generation_runs")
      .select("status, completed_at, entries_generated, error_message, tokens_used")
      .eq("client_id", user.client_id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("vault_items")
      .select("id, title")
      .eq("client_id", user.client_id)
      .eq("status", "ready"),
  ]);

  // Build a lookup map: vault item id -> title
  const vaultTitleMap: Record<string, string> = {};
  for (const v of vaultItems ?? []) {
    vaultTitleMap[(v as { id: string; title: string }).id] = (v as { id: string; title: string }).title;
  }

  const canRegenerate = user.role === "client_admin" || user.role === "super_admin";
  const totalEntries = entries?.length ?? 0;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Q&A Knowledge</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Curated Q&A generated from the Vault and Company DNA — Ask the Vault draws on these answers.
          </p>
        </div>
      </div>

      <VaultTabs active="knowledge" />

      <PageIntro id="knowledge-base" />

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="surface-card px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="label-section">Total Entries</span>
          </div>
          <p className="stat-value text-white">{totalEntries}</p>
        </div>

        <div className="surface-card px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="label-section">Last Generation</span>
          </div>
          <p className="stat-value text-white">{lastRun?.entries_generated ?? 0}</p>
        </div>

        <div className="surface-card px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
            <span className="label-section">Status</span>
          </div>
          <p className="text-lg font-bold text-white capitalize">{lastRun?.status ?? "Never"}</p>
        </div>

        <div className="surface-card px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="label-section">AI Tokens</span>
          </div>
          <p className="stat-value text-white">
            {lastRun?.tokens_used ? `${Math.round(lastRun.tokens_used / 1000)}k` : "—"}
          </p>
        </div>
      </div>

      {/* Main content */}
      <KbList
        entries={entries ?? []}
        lastRun={lastRun ?? null}
        canRegenerate={canRegenerate}
        clientId={user.client_id}
        vaultTitleMap={vaultTitleMap}
      />
    </div>
  );
}
