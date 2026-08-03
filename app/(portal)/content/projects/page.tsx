import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProjectsPage } from "@/components/content/ProjectsPage";
import { PageIntro } from "@/components/layout/PageIntro";
import { hasContentCapability } from "@/lib/auth/content-capabilities";
import { loadBrandStyle, loadProjects, loadTopics } from "@/lib/content/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "In progress — RapidTal" };

export default async function ProjectsRoute({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  if (!user.client_id) redirect("/dashboard");

  const admin = createAdminClient();
  const params = await searchParams;
  const requestedProjectId = typeof params.open === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(params.open)
    ? params.open
    : null;
  const [brandStyle, { projects, hasMore }, topics] = await Promise.all([
    loadBrandStyle(admin, user.client_id),
    loadProjects(admin, user.client_id),
    loadTopics(admin, user.client_id),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">In progress</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Continue unfinished content and saved ideas exactly where you left off.
      </p>
      <PageIntro id="content-projects" />
      <ProjectsPage
        clientId={user.client_id}
        canApprove={hasContentCapability(user.role, "approve_content")}
        brandStyle={brandStyle}
        initialProjects={projects}
        projectsHasMore={hasMore}
        initialTopics={topics}
        initialOpenProjectId={requestedProjectId}
      />
    </div>
  );
}
