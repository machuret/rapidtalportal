import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VaultClient } from "@/components/vault/VaultClient";
import { cn } from "@/lib/utils";
import { Archive } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { LinkedInVaultSourcePanel } from "@/components/vault/LinkedInVaultSourcePanel";
import { StyleAnalysisManager } from "@/components/content/StyleAnalysisManager";
import { VoiceGoldenLibrary } from "@/components/content/VoiceGoldenLibrary";
import { ContentPilotPanel } from "@/components/content/ContentPilotPanel";
import { loadProjects } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client Vaults — RapidTal" };

// Admin-only view for feeding any client's Vault (Business Brain). The vault
// write/read routes already authorize super_admin on any client via
// assertClientAccess, so this simply points the existing VaultClient at a
// chosen client_id.
export default async function AdminVaultPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ client?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { user } = await requireSuperAdmin();

  const admin = createAdminClient();
  const { data, error: clientsError } = await admin
    .from("clients")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  const clients = (data ?? []) as { id: string; name: string }[];

  if (clientsError) {
    return (
      <div>
        <AdminPageHeader icon={Archive} gradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
          title="Client Vaults" subtitle="Feed any client's Business Brain." />
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="font-medium text-red-200">Client Vaults could not be loaded.</p>
          <p className="mt-1 text-sm text-red-300/80">
            No data has been changed. Refresh the page; if this continues, check Admin Errors.
          </p>
        </div>
      </div>
    );
  }

  const clientId = searchParams.client && clients.some((c) => c.id === searchParams.client)
    ? searchParams.client
    : clients[0]?.id ?? null;
  const clientName = clients.find((c) => c.id === clientId)?.name;
  let linkedInUrl = "";
  let companyProfileLoadFailed = false;
  let pilotProjects: Awaited<ReturnType<typeof loadProjects>>["projects"] = [];
  if (clientId) {
    const [{ data: dna, error: dnaError }, projectsResult] = await Promise.all([
      admin
        .from("company_dna")
        .select("social_links")
        .eq("client_id", clientId)
        .maybeSingle(),
      loadProjects(admin, clientId, 51).catch(() => null),
    ]);
    companyProfileLoadFailed = !!dnaError;
    pilotProjects = projectsResult?.projects ?? [];
    const links = (dna as { social_links?: Record<string, string> } | null)?.social_links;
    linkedInUrl = typeof links?.linkedin === "string" ? links.linkedin : "";
  }

  if (clients.length === 0) {
    return (
      <div>
        <AdminPageHeader icon={Archive} gradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
          title="Client Vaults" subtitle="Feed any client's Business Brain." />
        <div className="surface-card rounded-xl p-10 text-center text-zinc-400 text-sm">
          No clients yet. Create a client first, then feed its Vault here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader icon={Archive} gradient="from-emerald-500 to-teal-600 shadow-emerald-500/20"
        title="Client Vaults" subtitle="Add documents, URLs, and notes to any client's Business Brain." />

      {/* Client picker */}
      <div className="flex flex-wrap gap-2 mb-8">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/admin/vault?client=${c.id}`}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              c.id === clientId
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600",
            )}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {clientId && (
        <>
          {companyProfileLoadFailed && (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              The company profile could not be loaded, so the saved LinkedIn URL may be missing.
              Vault items remain available and unchanged.
            </div>
          )}
          <ContentPilotPanel
            key={`pilot-${clientId}`}
            clientId={clientId}
            projects={pilotProjects}
          />
          <LinkedInVaultSourcePanel
            key={`linkedin-${clientId}`}
            clientId={clientId}
            clientName={clientName ?? "this company"}
            initialUrl={linkedInUrl}
          />
          <StyleAnalysisManager
            key={`style-${clientId}`}
            clientId={clientId}
            clientName={clientName}
            canEdit
          />
          <VoiceGoldenLibrary key={`goldens-${clientId}`} clientId={clientId} canEdit />
          <VaultClient
            key={clientId}
            clientId={clientId}
            userId={user.id}
            role="super_admin"
            canWrite
            title={`${clientName} — Vault`}
            subtitle="Everything you add here feeds this client's Business Brain and AI answers."
          />
        </>
      )}
    </div>
  );
}
