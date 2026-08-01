import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProjectsPage } from "@/components/content/ProjectsPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadBrandStyle, loadProjects, loadTopics } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects — RapidTal" };

export default async function ProjectsRoute() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const [brandStyle, { projects, hasMore }, topics] = await Promise.all([
    loadBrandStyle(admin, user.client_id),
    loadProjects(admin, user.client_id),
    loadTopics(admin, user.client_id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Projects</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Pick up exactly where you left off — every step is saved between sessions.
      </p>
      <PageIntro id="content-projects" />
      <ProjectsPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        brandStyle={brandStyle}
        initialProjects={projects}
        projectsHasMore={hasMore}
        initialTopics={topics}
      />
    </div>
  );
}
