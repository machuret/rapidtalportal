import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopsLibrary } from "@/components/sops/SopsLibrary";
import { PageIntro } from "@/components/layout/PageIntro";

export const dynamic = "force-dynamic";
export const metadata = { title: "SOPs — RapidTal" };

export default async function SopsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");

  const { user, client } = ctx;
  if (!user.client_id) redirect("/dashboard");
  // VA tool — VAs own process docs; clients see shared SOPs in the Notebook.
  if (user.role === "client_admin") redirect("/dashboard");

  const admin = createAdminClient();
  // The VA/client library = this client's SOPs PLUS the global admin library.
  const [{ data: sopsRaw }, { data: accessRows }] = await Promise.all([
    admin
      .from("sops")
      .select("*")
      .or(`client_id.eq.${user.client_id},client_id.is.null`)
      .order("category")
      .order("order_index"),
    // SOPs this VA has been explicitly granted (for restricted ones).
    admin.from("sop_access").select("sop_id").eq("user_id", user.id),
  ]);

  // Restricted SOPs are visible only to granted VAs (super_admin sees all).
  const allowed = new Set(((accessRows ?? []) as { sop_id: string }[]).map((r) => r.sop_id));
  const sops = ((sopsRaw ?? []) as Sop[]).filter(
    (s) => s.visibility !== "restricted" || user.role === "super_admin" || allowed.has(s.id),
  );

  // VAs author SOPs now that this is a VA tool (client_admin can't reach here).
  const canEdit = user.role === "va" || user.role === "super_admin";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Standard Operating Procedures</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Step-by-step processes for {client?.name ?? "your team"}, plus the shared RapidTal library.
      </p>
      <PageIntro id="sops" />
      <SopsLibrary
        sops={(sops ?? []) as Sop[]}
        clientId={user.client_id}
        userId={user.id}
        canEdit={canEdit}
      />
    </div>
  );
}

export interface Sop {
  id: string;
  client_id: string | null;
  title: string;
  category: string;
  subcategory?: string | null;
  visibility?: string;
  body: string;
  order_index: number;
  version?: number;
  forked_from?: string | null;
  forked_version?: number | null;
  created_at: string;
  updated_at: string;
}
