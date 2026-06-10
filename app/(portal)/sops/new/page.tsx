import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopNewForm } from "@/components/sops/SopNewForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const GLOBAL_SUGGESTED = ["WordPress", "Shopify", "AI", "Email", "SEO", "Social Media", "Admin", "Customer Support"];

export default async function SopNewPage({ searchParams }: { searchParams: { scope?: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const isGlobal = searchParams?.scope === "global";

  if (isGlobal) {
    if (user.role !== "super_admin") redirect("/sops");
  } else {
    if (!user.client_id) redirect("/dashboard");
    if (user.role !== "client_admin" && user.role !== "super_admin") redirect("/sops");
  }

  const admin = createAdminClient();
  let catQuery = admin.from("sops").select("category");
  catQuery = isGlobal ? catQuery.is("client_id", null) : catQuery.eq("client_id", user.client_id!);
  const { data: sopRows } = await catQuery;

  let categories = Array.from(
    new Set((sopRows ?? []).map((s: { category: string }) => s.category).filter(Boolean)),
  );
  if (isGlobal && categories.length === 0) categories = GLOBAL_SUGGESTED;

  const backHref = isGlobal ? "/admin/sops" : "/sops";

  return (
    <div className="max-w-3xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {isGlobal ? "Back to SOP Library" : "Back to SOPs"}
      </Link>
      <SopNewForm clientId={isGlobal ? null : user.client_id!} userId={user.id} categories={categories} />
    </div>
  );
}
