import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { LeadGenerationWorkspace } from "@/components/prospecting/LeadGenerationWorkspace";
import { PageIntro } from "@/components/layout/PageIntro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead Generation — RapidTal" };

export default async function LeadGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string | string[]; tab?: string | string[] }>;
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (!ctx.user.client_id) redirect("/dashboard");
  const params = await searchParams;
  const initialLeadId = typeof params.lead === "string" && /^[0-9a-f-]{36}$/iu.test(params.lead)
    ? params.lead
    : null;
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Lead Generation</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Find suitable businesses, review them, and add the right leads to CRM.
        </p>
      </div>
      <PageIntro id="lead-generation" />
      <LeadGenerationWorkspace
        clientId={ctx.user.client_id}
        initialLeadId={initialLeadId}
        initialTab={params.tab === "campaigns" ? "campaigns" : null}
      />
    </div>
  );
}
