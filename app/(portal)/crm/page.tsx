import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CrmBoard } from "@/components/crm/CrmBoard";
import { PageIntro } from "@/components/layout/PageIntro";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CrmContact } from "@/types/crm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";
import { FeatureReadyReporter } from "@/components/layout/FeatureReadyReporter";

// Canonical home is types/crm.ts — re-exported for existing importers.
export type { CrmContact } from "@/types/crm";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM — RapidTal" };

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string | string[] }>;
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");
  const clientId = user.client_id;
  const params = await searchParams;
  const requestedContactId = typeof params.contact === "string" && /^[0-9a-f-]{36}$/iu.test(params.contact)
    ? params.contact
    : null;

  const admin = createAdminClient();
  const { data: contacts, error: contactsError } = await withPortalDataTimeout(
    (signal) => admin
      .from("crm_contacts")
      .select("id, client_id, first_name, last_name, email, phone, company, job_title, status, source, tags, notes, archived_at, created_at, updated_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(500)
      .abortSignal(signal),
    "CRM contacts",
  );
  if (contactsError) throw new Error("CRM contacts could not be loaded.", { cause: contactsError });

  let visibleContacts = (contacts ?? []) as CrmContact[];
  if (requestedContactId && !visibleContacts.some((contact) => contact.id === requestedContactId)) {
    const targeted = await withPortalDataTimeout(
      (signal) => admin.from("crm_contacts")
        .select("id, client_id, first_name, last_name, email, phone, company, job_title, status, source, tags, notes, archived_at, created_at, updated_at")
        .eq("client_id", clientId)
        .eq("id", requestedContactId)
        .abortSignal(signal)
        .maybeSingle(),
      "CRM contact",
      5_000,
    );
    if (targeted.data) visibleContacts = [targeted.data as CrmContact, ...visibleContacts];
  }

  const isAdmin = user.role === "client_admin" || user.role === "super_admin";

  return (
    <div>
      <FeatureReadyReporter feature="crm_contacts" />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Contacts for {client?.name ?? "your client"}
          </p>
        </div>
        <Link
          href="/crm/add-contact"
          className={cn(buttonVariants(), "bg-zinc-800 hover:bg-zinc-700 border-zinc-700")}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Contact
        </Link>
      </div>
      <PageIntro id="crm" />
      <CrmBoard
        contacts={visibleContacts}
        clientId={clientId}
        userId={user.id}
        isAdmin={isAdmin}
        initialContactId={requestedContactId}
      />
    </div>
  );
}
