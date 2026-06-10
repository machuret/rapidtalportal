import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopDetail } from "@/components/sops/SopDetail";
import type { Sop } from "@/app/(portal)/sops/page";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const admin = createAdminClient();
  const { data: sopRow } = await admin.from("sops").select("*").eq("id", params.id).maybeSingle();
  if (!sopRow) notFound();
  const sop = sopRow as Sop;

  const isGlobal = sop.client_id === null;
  const sameClient = !!user.client_id && sop.client_id === user.client_id;

  // Access: global SOPs are readable by anyone; client SOPs only by that client
  // (or a super_admin).
  if (!isGlobal && !sameClient && user.role !== "super_admin") notFound();

  // Edit rights: global → super_admin only; client → super_admin or the client's admin.
  const canEdit = isGlobal
    ? user.role === "super_admin"
    : user.role === "super_admin" || (user.role === "client_admin" && sameClient);

  // A client admin viewing a Library SOP can fork it into their own client.
  const forkToClientId =
    isGlobal && !!user.client_id && (user.role === "client_admin" || user.role === "super_admin")
      ? user.client_id
      : null;

  // Category suggestions from the same scope.
  let catQuery = admin.from("sops").select("category");
  catQuery = isGlobal ? catQuery.is("client_id", null) : catQuery.eq("client_id", sop.client_id!);
  const { data: allSops } = await catQuery;
  const categories = Array.from(
    new Set((allSops ?? []).map((s: { category: string }) => s.category).filter(Boolean)),
  );

  const backHref = isGlobal && user.role === "super_admin" ? "/admin/sops" : "/sops";

  return (
    <div className="max-w-3xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {isGlobal && user.role === "super_admin" ? "Back to SOP Library" : "Back to SOPs"}
      </Link>
      {isGlobal && (
        <div className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-2.5 py-0.5">
          RapidTal Library — shared with all VAs
        </div>
      )}
      <SopDetail sop={sop} canEdit={canEdit} clientId={sop.client_id} categories={categories} forkToClientId={forkToClientId} />
    </div>
  );
}
