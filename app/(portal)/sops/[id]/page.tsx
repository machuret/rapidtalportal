import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopDetail } from "@/components/sops/SopDetail";
import type { Sop } from "@/app/(portal)/sops/page";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const admin = createAdminClient();
  const { data: sopRow } = await admin.from("sops").select("*").eq("id", params.id).is("deleted_at", null).maybeSingle();
  if (!sopRow) notFound();
  const sop = sopRow as Sop;

  const isGlobal = sop.client_id === null;
  const sameClient = !!user.client_id && sop.client_id === user.client_id;

  // Access: global SOPs are readable by anyone; client SOPs only by that client
  // (or a super_admin).
  if (!isGlobal && !sameClient && user.role !== "super_admin") notFound();

  // Restricted SOPs: only granted VAs (and super_admin) may open them directly.
  if (sop.visibility === "restricted" && user.role !== "super_admin") {
    const { data: grant } = await admin
      .from("sop_access").select("sop_id").eq("sop_id", sop.id).eq("user_id", user.id).maybeSingle();
    if (!grant) notFound();
  }

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
  let catQuery = admin.from("sops").select("category").is("deleted_at", null);
  catQuery = isGlobal ? catQuery.is("client_id", null) : catQuery.eq("client_id", sop.client_id!);
  const { data: allSops } = await catQuery;
  const categories = Array.from(
    new Set((allSops ?? []).map((s: { category: string }) => s.category).filter(Boolean)),
  );

  // Fork drift: has the original moved on since this copy was forked?
  let driftAhead = 0;
  if (sop.forked_from && sop.forked_version != null) {
    const { data: srcRow } = await admin.from("sops").select("version").eq("id", sop.forked_from).maybeSingle();
    const srcVersion = (srcRow as { version: number } | null)?.version;
    if (srcVersion != null && srcVersion > sop.forked_version) driftAhead = srcVersion - sop.forked_version;
  }

  const backHref = isGlobal && user.role === "super_admin" ? "/admin/sops" : "/sops";

  return (
    <div className="page-prose">
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
      {driftAhead > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            The original has been updated <span className="font-semibold">{driftAhead} time{driftAhead !== 1 ? "s" : ""}</span> since this copy was forked.
            Review the source SOP to see what changed{canEdit ? " and bring across anything useful." : "."}
          </p>
        </div>
      )}
      <SopDetail sop={sop} canEdit={canEdit} clientId={sop.client_id} categories={categories} forkToClientId={forkToClientId} />
    </div>
  );
}
