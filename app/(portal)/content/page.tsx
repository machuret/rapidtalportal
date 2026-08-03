import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content — RapidTal" };

/**
 * /content is a smart default, not a page: people with unfinished work land on
 * Projects (resume beats create), everyone else lands on Quick Draft.
 */
export default async function ContentPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("content_projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", user.client_id)
    .in("status", ["active", "saved"])
    .limit(1);
  if (error) throw error;

  redirect((count ?? 0) > 0 ? "/content/projects" : "/content/quick");
}
