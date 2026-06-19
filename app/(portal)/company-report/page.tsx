import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { Brain } from "lucide-react";
import { KnowledgeCoverage } from "@/components/brain/KnowledgeCoverage";
import { PageIntro } from "@/components/layout/PageIntro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Report — RapidTal" };

// Client admins now see this same coverage inside Company Brain (/brain); VAs
// reach it here. Both render the shared <KnowledgeCoverage> so there's one
// report, not two implementations.
export default async function CompanyReportPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const canCurate = user.role === "client_admin" || user.role === "super_admin";

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Company Report</h1>
          <p className="text-zinc-400 text-sm mt-1">
            What the Vault knows about {client?.name ?? "your company"} — the more you add, the more complete it gets.
          </p>
        </div>
      </div>

      <PageIntro id="company-report" />

      <KnowledgeCoverage clientId={user.client_id} clientName={client?.name ?? ""} canCurate={canCurate} />
    </div>
  );
}
