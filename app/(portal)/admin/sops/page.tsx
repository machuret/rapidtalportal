import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopsLibrary } from "@/components/sops/SopsLibrary";
import type { Sop } from "@/app/(portal)/sops/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "SOP Library — RapidTal" };

export default async function AdminSopsPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  if (ctx.user.role !== "super_admin") redirect("/dashboard");

  const admin = createAdminClient();
  const { data: sops } = await admin
    .from("sops")
    .select("*")
    .is("client_id", null)
    .order("category")
    .order("order_index");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">SOP Library</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Generic, reusable SOPs (WordPress, Shopify, AI, email…) shared with <span className="text-zinc-300">every VA across all clients</span>.
        Build great step-by-step checklists here — they enrich every VA&apos;s everyday work.
      </p>
      <SopsLibrary
        sops={(sops ?? []) as Sop[]}
        clientId=""
        userId={ctx.user.id}
        canEdit
        newHref="/sops/new?scope=global"
      />
    </div>
  );
}
