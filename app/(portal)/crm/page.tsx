import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CrmBoard } from "@/components/crm/CrmBoard";
import { PageIntro } from "@/components/layout/PageIntro";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM — RapidTal" };

export default async function CrmPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: contacts } = await admin
    .from("crm_contacts")
    .select("id, client_id, first_name, last_name, email, phone, company, job_title, status, source, tags, notes, archived_at, created_at, updated_at")
    .eq("client_id", user.client_id)
    .order("created_at", { ascending: false })
    .limit(500);

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
        <Link href="/crm/add-contact">
          <Button className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
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

export interface CrmContact {
  id: string;
  client_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  status: string;
  source: string | null;
  tags: string[];
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
