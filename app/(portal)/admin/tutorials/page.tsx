import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MonitorPlay } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TutorialsManager, type FeatureVideoRow } from "@/components/admin/TutorialsManager";
import { FEATURE_SLUGS, FEATURE_TITLES } from "@/lib/tutorials/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutorials — RapidTal" };

export default async function AdminTutorialsPage() {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { data } = await admin.from("feature_videos").select("slug, loom_url");
  const bySlug = new Map(((data ?? []) as { slug: string; loom_url: string }[]).map((r) => [r.slug, r.loom_url]));

  const features: FeatureVideoRow[] = FEATURE_SLUGS.map((slug) => ({
    slug,
    title: FEATURE_TITLES[slug] ?? slug,
    loomUrl: bySlug.get(slug) ?? null,
  }));

  return (
    <div className="max-w-4xl">
      <AdminPageHeader icon={MonitorPlay} gradient="from-amber-500 to-orange-600 shadow-amber-500/20"
        title="Tutorials"
        subtitle="Add a help video to any feature, and edit the Client and VA guides — including a video in each guide section. Changes go live within seconds, no deploy." />

      <TutorialsManager features={features} />
    </div>
  );
}
