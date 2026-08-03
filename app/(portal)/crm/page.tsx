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

// Canonical home is types/crm.ts — re-exported for existing importers.
export type { CrmContact } from "@/types/crm";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM — RapidTal" };

export default async function CrmPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: contacts, error: contactsError } = await withPortalDataTimeout(
    admin
      .from("crm_contacts")
      .select("id, client_id, first_name, last_name, email, phone, company, job_title, status, source, tags, notes, archived_at, created_at, updated_at")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false })
      .limit(500),
    "CRM contacts",
  );
  if (contactsError) throw new Error("CRM contacts could not be loaded.", { cause: contactsError });

  const isAdmin = user.role === "client_admin" || user.role === "super_admin";

  return (
    <div>
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
        contacts={(contacts ?? []) as CrmContact[]}
        clientId={user.client_id}
        userId={user.id}
        isAdmin={isAdmin}
      />
    </div>
  );
}
