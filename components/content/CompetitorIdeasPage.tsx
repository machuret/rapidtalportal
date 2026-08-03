"use client";

import { useRouter } from "next/navigation";
import { useContentProjects } from "@/hooks/useContentProjects";
import { CompetitorsTab } from "@/components/content/competitors/CompetitorsTab";
import { ContentErrorBoundary } from "./ErrorBoundary";
import { ProjectTakeover } from "./ProjectTakeover";

/** Unified competitor collection, analysis and idea-promotion workspace. */
export function CompetitorIdeasPage({
  clientId,
  canApprove,
  canManage,
  brandStyle,
}: {
  clientId: string;
  canApprove: boolean;
  canManage: boolean;
  brandStyle: Record<string, unknown>;
}) {
  const router = useRouter();
  const projects = useContentProjects(clientId, [], false);

  async function promoteIdea(
    idea: Parameters<typeof projects.handleCompetitorIdeaSelected>[0],
    run: Parameters<typeof projects.handleCompetitorIdeaSelected>[1],
  ) {
    const created = await projects.handleCompetitorIdeaSelected(idea, run);
    if (created) {
      projects.closeProject();
      router.push(`/content/projects?open=${encodeURIComponent(created.id)}`);
      return true;
    }
    return false;
  }

  if (projects.activeProject) {
    return (
      <ProjectTakeover
        clientId={clientId}
        canApprove={canApprove}
        brandStyle={brandStyle}
        projects={projects}
        onContentGenerated={() => {}}
      />
    );
  }

  return (
    <ContentErrorBoundary>
      <CompetitorsTab
        clientId={clientId}
        canManage={canManage}
        onIdeaSelected={promoteIdea}
      />
    </ContentErrorBoundary>
  );
}
