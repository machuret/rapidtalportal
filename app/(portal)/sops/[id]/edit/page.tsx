import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopStudio, type ExistingSop } from "@/components/sops/SopStudio";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SopEditPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { improve?: string };
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, client_id, title, category, subcategory, body, steps, intro, prerequisites, visibility")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!sop) notFound();

  // as unknown as — generated DB types don't include `subcategory` until they're
  // regenerated after migration 063; the runtime shape is correct.
  const s = sop as unknown as ExistingSop & { client_id: string | null };

  // Same scope rules as the write API: global = super_admin, client = admins.
  const isGlobal = s.client_id === null;
  if (isGlobal) {
    if (user.role !== "super_admin") redirect(`/sops/${s.id}`);
  } else {
    if (!["client_admin", "super_admin"].includes(user.role)) redirect(`/sops/${s.id}`);
    if (user.role !== "super_admin" && s.client_id !== user.client_id) notFound();
  }

  // Categories + subcategories for the pickers.
  let catQuery = admin.from("sops").select("category, subcategory").is("deleted_at", null);
  catQuery = isGlobal ? catQuery.is("client_id", null) : catQuery.eq("client_id", s.client_id!);
  const { data: sopRows } = await catQuery;
  const pickerRows = (sopRows ?? []) as unknown as { category: string | null; subcategory: string | null }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mq = (admin as any).from("sop_categories").select("kind, name");
  mq = isGlobal ? mq.is("client_id", null) : mq.eq("client_id", s.client_id!);
  const { data: managed } = await mq;
  const managedCats = ((managed ?? []) as { kind: string; name: string }[]).filter((m) => m.kind === "category").map((m) => m.name);
  const managedSubs = ((managed ?? []) as { kind: string; name: string }[]).filter((m) => m.kind === "subcategory").map((m) => m.name);
  const categories = Array.from(new Set([...(pickerRows.map((r) => r.category).filter(Boolean) as string[]), ...managedCats]));
  const subcategories = Array.from(new Set([...(pickerRows.map((r) => r.subcategory).filter(Boolean) as string[]), ...managedSubs]));

  // VA picker + this SOP's current access list (for restricted visibility).
  let vaQuery = admin.from("users").select("id, full_name, email").eq("role", "va");
  if (!isGlobal) vaQuery = vaQuery.eq("client_id", s.client_id!);
  const [{ data: vaRows }, { data: accessRows }] = await Promise.all([
    vaQuery.order("full_name"),
    admin.from("sop_access").select("user_id").eq("sop_id", s.id),
  ]);
  const vaOptions = ((vaRows ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((v) => ({ id: v.id, name: v.full_name || v.email }));
  const accessUserIds = ((accessRows ?? []) as { user_id: string }[]).map((r) => r.user_id);

  return (
    <div className="max-w-3xl">
      <Link href={`/sops/${s.id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to SOP
      </Link>
      <SopStudio
        clientId={s.client_id}
        userId={user.id}
        categories={categories}
        subcategories={subcategories}
        vaOptions={vaOptions}
        existing={{ id: s.id, title: s.title, category: s.category, subcategory: s.subcategory, body: s.body, steps: s.steps, intro: s.intro, prerequisites: s.prerequisites, visibility: s.visibility, accessUserIds }}
        autoImprove={searchParams?.improve === "1"}
      />
    </div>
  );
}
