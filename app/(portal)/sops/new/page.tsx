import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopStudio } from "@/components/sops/SopStudio";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const GLOBAL_SUGGESTED = ["WordPress", "Shopify", "AI", "Email", "SEO", "Social Media", "Admin", "Customer Support"];

export default async function SopNewPage({ searchParams }: { searchParams: { scope?: string; title?: string; category?: string } }) {
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
  let catQuery = admin.from("sops").select("category, subcategory");
  catQuery = isGlobal ? catQuery.is("client_id", null) : catQuery.eq("client_id", user.client_id!);
  const { data: sopRows } = await catQuery;
  const rows = (sopRows ?? []) as unknown as { category: string | null; subcategory: string | null }[];

  // Managed categories (incl. empty ones created in the manager).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mq = (admin as any).from("sop_categories").select("kind, name");
  mq = isGlobal ? mq.is("client_id", null) : mq.eq("client_id", user.client_id!);
  const { data: managed } = await mq;
  const managedCats = ((managed ?? []) as { kind: string; name: string }[]).filter((m) => m.kind === "category").map((m) => m.name);
  const managedSubs = ((managed ?? []) as { kind: string; name: string }[]).filter((m) => m.kind === "subcategory").map((m) => m.name);

  let categories = Array.from(new Set([...rows.map((s) => s.category).filter(Boolean) as string[], ...managedCats]));
  if (isGlobal && categories.length === 0) categories = GLOBAL_SUGGESTED;
  const subcategories = Array.from(new Set([...rows.map((s) => s.subcategory).filter(Boolean) as string[], ...managedSubs]));

  // VAs that can be granted access to a restricted SOP: all VAs (global scope)
  // or just this client's VAs.
  let vaQuery = admin.from("users").select("id, full_name, email").eq("role", "va");
  if (!isGlobal) vaQuery = vaQuery.eq("client_id", user.client_id!);
  const { data: vaRows } = await vaQuery.order("full_name");
  const vaOptions = ((vaRows ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((v) => ({ id: v.id, name: v.full_name || v.email }));

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
      <SopStudio
        clientId={isGlobal ? null : user.client_id!}
        userId={user.id}
        categories={categories}
        subcategories={subcategories}
        vaOptions={vaOptions}
        initialTopic={searchParams?.title}
        initialCategory={searchParams?.category}
      />
    </div>
  );
}
