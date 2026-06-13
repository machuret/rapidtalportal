import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ComposeClient, type ComposeContact } from "@/components/vault/ComposeClient";
import { PageIntro } from "@/components/layout/PageIntro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compose — RapidTal" };

export default async function ComposePage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");
  // VA tool — clients drive this through their VA, not directly.
  if (user.role === "client_admin") redirect("/dashboard");

  // Feed brand voice + recent contacts in from the server — no new endpoints.
  const admin = createAdminClient();
  const [{ data: dna }, { data: contacts }] = await Promise.all([
    admin.from("company_dna").select("brand_voice, sign_off").eq("client_id", user.client_id).maybeSingle(),
    admin.from("crm_contacts")
      .select("id, first_name, last_name, company, email")
      .eq("client_id", user.client_id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const dnaRow = (dna ?? {}) as { brand_voice: string | null; sign_off: string | null };
  const contactList: ComposeContact[] = ((contacts ?? []) as {
    id: string; first_name: string; last_name: string | null; company: string | null; email: string | null;
  }[]).map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    company: c.company,
    email: c.email,
  }));

  return (
    <div className="max-w-3xl">
      <PageIntro id="compose" />
      <ComposeClient
        clientId={user.client_id}
        companyName={client?.name ?? "the company"}
        brandVoice={dnaRow.brand_voice}
        signOff={dnaRow.sign_off}
        contacts={contactList}
      />
    </div>
  );
}
