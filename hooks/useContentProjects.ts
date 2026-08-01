/**
 * Shared Content Studio project state machine, extracted from the old
 * ContentStudio monolith so each content sub-page (quick, ideas, projects,
 * competitors) drives the same create/open/update/archive flow and the same
 * full-page workflow takeover — one implementation, six surfaces.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type {
  ContentProject,
  ContentProjectIdea,
  ContentTopic,
} from "@/types/content";
import {
  competitorIdeaToBrief,
  type CompetitorIntelligenceIdea,
} from "@/lib/competitors/intelligence";

interface ContentPage<T> {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
}

export function useContentProjects(
  clientId: string,
  initialProjects: ContentProject[],
  initialHasMore: boolean,
) {
  const [projects, setProjects] = useState<ContentProject[]>(initialProjects);
  const [projectsHasMore, setProjectsHasMore] = useState(initialHasMore);
  const [loadingMoreProjects, setLoadingMoreProjects] = useState(false);
  const [activeProject, setActiveProject] = useState<ContentProject | null>(null);
  const [openingProject, setOpeningProject] = useState<string | null>(null);
  const [archivingProject, setArchivingProject] = useState<string | null>(null);

  const updateProject = useCallback((project: ContentProject) => {
    setActiveProject(project);
    setProjects((previous) => {
      const exists = previous.some((item) => item.id === project.id);
      return exists
        ? previous.map((item) => item.id === project.id ? project : item)
        : [project, ...previous];
    });
  }, []);

  const createProject = useCallback(async (idea: ContentProjectIdea) => {
    try {
      const created = await api.post<ContentProject>(ROUTES.content.projects(), {
        client_id: clientId,
        idea,
      });
      updateProject(created);
      return created;
    } catch {
      return null;
    }
  }, [clientId, updateProject]);

  const openProject = useCallback(async (projectId: string) => {
    setOpeningProject(projectId);
    try {
      const project = await api.get<ContentProject>(
        ROUTES.content.project(clientId, projectId),
      );
      updateProject(project);
    } catch {
      // API client shows the error.
    } finally {
      setOpeningProject(null);
    }
  }, [clientId, updateProject]);

  const closeProject = useCallback(() => setActiveProject(null), []);

  const archiveUnfinishedProject = useCallback(async (project: ContentProject) => {
    if (!window.confirm(`Remove “${project.title}” from unfinished projects? Any drafts already created will remain available.`)) {
      return;
    }
    setArchivingProject(project.id);
    try {
      const archived = await api.patch<ContentProject>(ROUTES.content.projects(), {
        client_id: clientId,
        id: project.id,
        expected_updated_at: project.updated_at,
        status: "rejected",
        current_step: "complete",
      });
      setProjects((previous) => previous.map((item) => item.id === archived.id ? archived : item));
      toast.success("Project removed from unfinished work.");
    } catch {
      // API client presents the actionable error.
    } finally {
      setArchivingProject(null);
    }
  }, [clientId]);

  const loadMoreProjects = useCallback(async () => {
    if (loadingMoreProjects || !projectsHasMore) return;
    setLoadingMoreProjects(true);
    try {
      const page = await api.get<ContentPage<ContentProject>>(
        ROUTES.content.projectsPage(clientId, projects.length),
        { showErrorToast: false },
      );
      setProjects((previous) => [
        ...previous,
        ...page.items.filter((item) => !previous.some((existing) => existing.id === item.id)),
      ]);
      setProjectsHasMore(page.hasMore);
    } catch {
      toast.error("Older content projects could not be loaded. Please try again.");
    } finally {
      setLoadingMoreProjects(false);
    }
  }, [clientId, loadingMoreProjects, projects.length, projectsHasMore]);

  const handleTopicSelected = useCallback(async (topic: ContentTopic) => {
    const existing = projects.find((project) =>
      project.idea_snapshot.topicId === topic.id &&
      ["active", "saved"].includes(project.status));
    if (existing) {
      await openProject(existing.id);
      return;
    }
    const explainability = topic.why?.explainability ?? null;
    await createProject({
      version: 1,
      origin: "company_topic",
      title: topic.title,
      channel: topic.content_type === "social" ? "linkedin" : topic.content_type,
      rationale: explainability?.whyValuable || topic.description || "Selected from the company’s approved content priorities and Vault-informed ideas.",
      differentiation: explainability?.differenceFromExisting || "The final brief will define a company-specific angle before generation.",
      evidenceSummary: explainability
        ? `${explainability.supportingVaultMaterial.length} Vault source${explainability.supportingVaultMaterial.length === 1 ? "" : "s"} and ${explainability.supportingMarketSignals.length} market signal${explainability.supportingMarketSignals.length === 1 ? "" : "s"} informed this idea.`
        : "Company DNA, Vault material and approved content priorities informed this idea.",
      topicId: topic.id,
      brainContextSnapshotId: topic.brain_context_snapshot_id ?? null,
      marketIntelligence: null,
      explainability,
    });
  }, [createProject, openProject, projects]);

  const handleCompetitorIdeaSelected = useCallback(async (
    idea: CompetitorIntelligenceIdea,
    run: Parameters<typeof competitorIdeaToBrief>[1],
  ) => {
    const result = competitorIdeaToBrief(idea, run);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await createProject({
      version: 1,
      origin: "competitor_intelligence",
      title: idea.title,
      channel: idea.channel,
      rationale: idea.why_valuable,
      differentiation: idea.differentiation,
      evidenceSummary: `${idea.source_item_ids.length} immutable competitor captures and ${idea.company_reference_ids.length} company/Vault comparisons informed this opportunity.`,
      marketIntelligence: result.brief.marketIntelligence,
    });
  }, [createProject]);

  const handleVaultGapSelected = useCallback(async (question: string) => {
    await createProject({
      version: 1,
      origin: "company_topic",
      title: question,
      channel: "linkedin",
      rationale: "The team asked this question and the company Vault could not answer it.",
      differentiation: "Turn a demonstrated knowledge gap into a useful company-led explanation.",
      evidenceSummary: "Observed as an unanswered question in the company Vault.",
      marketIntelligence: null,
    });
  }, [createProject]);

  return {
    projects,
    setProjects,
    projectsHasMore,
    loadingMoreProjects,
    loadMoreProjects,
    activeProject,
    openingProject,
    archivingProject,
    openProject,
    closeProject,
    updateProject,
    createProject,
    archiveUnfinishedProject,
    handleTopicSelected,
    handleCompetitorIdeaSelected,
    handleVaultGapSelected,
  };
}

export type ContentProjectsApi = ReturnType<typeof useContentProjects>;
