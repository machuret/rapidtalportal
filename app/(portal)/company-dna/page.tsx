import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Brain, BookOpenCheck } from "lucide-react";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DnaForm } from "@/components/dna/DnaForm";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { OnboardingStepReporter } from "@/components/onboarding/OnboardingStepReporter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company profile — RapidTal" };

export default async function CompanyDnaPage({
  searchParams,
}: {
  searchParams?: Promise<{ setup?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/admin/clients");

  const admin = createAdminClient();
  const { data: dna } = await admin
    .from("company_dna")
    .select("*")
    .eq("client_id", user.client_id)
    .maybeSingle();

  // Admin-only editing: DNA feeds every AI answer, so a stray VA edit would
  // silently poison the Brain. VAs read it; admins own it.
  const canEdit = hasContentCapability(user.role, "edit_company_dna");
  const requestedFocus = params?.setup === "company" || params?.setup === "voice"
    ? params.setup
    : null;
  const focusMode = canEdit ? requestedFocus : null;

  return (
    <div className="page-prose">
      {!focusMode && (
        <>
          <h1 className="text-2xl font-bold mb-1">Company profile</h1>
          <p className="text-zinc-400 text-sm mb-8">
            The core profile of {client?.name ?? "your client"} — identity, services, audience, goals and company channels.
            The AI reads this in every answer, topic and draft it produces, so the more you fill in, the smarter and more on-brand everything becomes.
            {!canEdit && " Read-only: ask your admin to update anything that's wrong."}
          </p>
          <PageIntro id="company-dna" />
          <details className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white">
              Advanced company tools
            </summary>
            <div className="grid gap-3 border-t border-zinc-800 p-4 sm:grid-cols-2">
              <Link href="/brain" className="group rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 hover:border-purple-500/40">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Brain className="h-4 w-4 text-purple-300" />
                  Brain readiness and learning
                  <ArrowRight className="ml-auto h-4 w-4 text-zinc-600 group-hover:text-purple-300" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">Review readiness, learned preferences and knowledge gaps when you need deeper diagnostics.</span>
              </Link>
              <Link href="/vault/knowledge" className="group rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 hover:border-blue-500/40">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BookOpenCheck className="h-4 w-4 text-blue-300" />
                  Q&amp;A knowledge
                  <ArrowRight className="ml-auto h-4 w-4 text-zinc-600 group-hover:text-blue-300" />
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">Review direct questions and answers that complement your uploaded company knowledge.</span>
              </Link>
            </div>
          </details>
        </>
      )}
      <DnaForm
        initialData={dna ?? null}
        clientId={user.client_id}
        readOnly={!canEdit}
        focusMode={focusMode}
        sectionMode="profile"
      />
      {focusMode && <OnboardingStepReporter clientId={user.client_id} step={focusMode} />}
    </div>
  );
}
