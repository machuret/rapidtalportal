import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SopRunner } from "@/components/sops/SopRunner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SopRunPage({ params }: { params: { id: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, title, body, client_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!sop) notFound();
  const s = sop as { id: string; title: string; body: string; client_id: string | null };

  const isGlobal = s.client_id === null;
  const sameClient = !!user.client_id && s.client_id === user.client_id;
  if (!isGlobal && !sameClient && user.role !== "super_admin") notFound();

  return (
    <div className="max-w-3xl">
      <Link href={`/sops/${s.id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to SOP
      </Link>
      <SopRunner sopId={s.id} title={s.title} body={s.body} clientId={user.client_id ?? ""} />
    </div>
  );
}
