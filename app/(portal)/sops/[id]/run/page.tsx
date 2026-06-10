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
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, title, body")
    .eq("id", params.id)
    .eq("client_id", user.client_id)
    .single();

  if (!sop) notFound();
  const s = sop as { id: string; title: string; body: string };

  return (
    <div className="max-w-3xl">
      <Link href={`/sops/${s.id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to SOP
      </Link>
      <SopRunner title={s.title} body={s.body} clientId={user.client_id} />
    </div>
  );
}
