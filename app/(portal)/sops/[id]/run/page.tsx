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
    .select("id, title, body, client_id, steps, intro, prerequisites, visibility")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sop) notFound();
  const s = sop as {
    id: string; title: string; body: string; client_id: string | null;
    steps: { title: string; detail: string; tip?: string }[] | null;
    intro: string | null; prerequisites: string[] | null; visibility: string | null;
  };

  const isGlobal = s.client_id === null;
  const sameClient = !!user.client_id && s.client_id === user.client_id;
  if (!isGlobal && !sameClient && user.role !== "super_admin") notFound();

  // Restricted SOPs: only granted VAs (and super_admin) may run them — mirror the
  // detail page's gate so the runner can't be used to bypass visibility.
  if (s.visibility === "restricted" && user.role !== "super_admin") {
    const { data: grant } = await admin
      .from("sop_access").select("sop_id").eq("sop_id", s.id).eq("user_id", user.id).maybeSingle();
    if (!grant) notFound();
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/sops/${s.id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to SOP
      </Link>
      <SopRunner
        sopId={s.id} title={s.title} body={s.body} clientId={user.client_id ?? ""}
        structured={s.steps ?? undefined} intro={s.intro ?? undefined} prerequisites={s.prerequisites ?? undefined}
      />
    </div>
  );
}
