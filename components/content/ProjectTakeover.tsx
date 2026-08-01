"use client";

import type { ContentPiece } from "@/types/content";
import type { ContentProjectsApi } from "@/hooks/useContentProjects";
import { ContentErrorBoundary } from "./ErrorBoundary";
import { ContentProjectWorkflow } from "./ContentProjectWorkflow";

/**
 * The full-page 7-step workflow takeover every content sub-page renders when
 * a project is active. Same wizard as the old monolith — clicking an
 * idea/project replaces the page render.
 */
export function ProjectTakeover({
  clientId,
  canApprove,
  brandStyle,
  projects,
  onContentGenerated,
  onRegenerateIdeas,
}: {
  clientId: string;
  canApprove: boolean;
  brandStyle: Record<string, unknown>;
  projects: ContentProjectsApi;
  onContentGenerated: (piece: ContentPiece) => void;
  onRegenerateIdeas?: () => void;
}) {
  if (!projects.activeProject) return null;
  return (
    <ContentErrorBoundary>
      <ContentProjectWorkflow
        key={projects.activeProject.id}
        clientId={clientId}
        canApprove={canApprove}
        brandStyle={brandStyle}
        project={projects.activeProject}
        onProjectChange={projects.updateProject}
        onClose={projects.closeProject}
        onRegenerateIdeas={onRegenerateIdeas ?? projects.closeProject}
        onContentGenerated={onContentGenerated}
      />
    </ContentErrorBoundary>
  );
}
