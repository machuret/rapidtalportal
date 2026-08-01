"use client";

import { useMemo, useState } from "react";
import { ArchiveX, ArrowRight, Clock3, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentProject, ContentTopic } from "@/types/content";
import { useContentProjects } from "@/hooks/useContentProjects";
import { ProjectTakeover } from "./ProjectTakeover";

function projectProgress(project: ContentProject): string {
  if (project.last_error_message && project.last_operation === "generate") {
    return "Generation failed — ready to retry";
  }
  if (project.status === "saved") return "Saved idea";
  if (project.current_step === "complete") {
    return `${project.status.charAt(0).toUpperCase()}${project.status.slice(1)}`;
  }
  if (["idea", "brief", "evidence", "generate"].includes(project.current_step)) {
    return "Preparing draft";
  }
  if (project.current_step === "edit") return "Draft";
  return "In review";
}

/** /content/projects — approved ideas ready to start + unfinished work. */
export function ProjectsPage({
  clientId,
  canApprove,
  brandStyle,
  initialProjects,
  projectsHasMore,
  initialTopics,
}: {
  clientId: string;
  canApprove: boolean;
  brandStyle: Record<string, unknown>;
  initialProjects: ContentProject[];
  projectsHasMore: boolean;
  initialTopics: ContentTopic[];
}) {
  const projects = useContentProjects(clientId, initialProjects, projectsHasMore);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const unfinished = useMemo(
    () => projects.projects.filter((project) => ["active", "saved"].includes(project.status)),
    [projects.projects],
  );
  const approvedTopics = useMemo(
    () => initialTopics.filter((topic) => topic.status === "approved"),
    [initialTopics],
  );

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
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-purple-300">Continue working</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Your unfinished drafts</h2>
            <p className="mt-1 text-sm text-zinc-500">Every idea, source choice and draft is saved between sessions.</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">IDEAS approved</p>
          <p className="mt-1 text-xs text-zinc-500">Saved ideas stay here after refresh. Start or continue a draft whenever you are ready.</p>
          {approvedTopics.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {approvedTopics.slice(0, 12).map((topic) => {
                const existing = projects.projects.find((project) =>
                  project.idea_snapshot.topicId === topic.id &&
                  ["active", "saved"].includes(project.status));
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => void projects.handleTopicSelected(topic)}
                    className="rounded-lg border border-emerald-500/20 bg-zinc-950 p-3 text-left hover:border-emerald-400/50"
                  >
                    <span className="block text-xs capitalize text-emerald-300">
                      {topic.content_type} · {existing ? "Continue draft" : "Start draft"}
                    </span>
                    <span className="mt-1 block text-sm text-zinc-200">{topic.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
              No approved ideas yet. Generate ideas below, then click “{canApprove ? "Save idea" : "Save for approval"}”.
            </p>
          )}
        </div>

        {unfinished.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {(showAllProjects ? unfinished : unfinished.slice(0, 6)).map((project) => (
              <div key={project.id} className="group relative rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-purple-500/40 hover:bg-zinc-800/70">
                <button type="button" onClick={() => projects.openProject(project.id)} className="w-full p-4 pr-11 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-purple-500/10 px-2 py-1 text-2xs font-medium uppercase text-purple-300">{projectProgress(project)}</span>
                    {projects.openingProject === project.id ? <Clock3 className="h-4 w-4 animate-spin text-zinc-500" /> : <ArrowRight className="h-4 w-4 text-zinc-600" />}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-medium text-white">{project.title}</p>
                  <p className="mt-2 text-xs capitalize text-zinc-500">{project.idea_snapshot.channel} · {project.idea_snapshot.origin.replaceAll("_", " ")}</p>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${project.title} from unfinished projects`}
                  title="Remove from unfinished projects"
                  disabled={projects.archivingProject === project.id}
                  onClick={() => void projects.archiveUnfinishedProject(project)}
                  className="absolute right-2 top-2 rounded-md p-1.5 text-zinc-600 opacity-60 transition hover:bg-zinc-900 hover:text-red-300 group-hover:opacity-100 disabled:opacity-40"
                >
                  {projects.archivingProject === project.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ArchiveX className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
            {unfinished.length > 6 && (
              <Button
                variant="ghost"
                className="sm:col-span-2 xl:col-span-3"
                onClick={() => setShowAllProjects((value) => !value)}
              >
                {showAllProjects ? "Show recent projects" : `View all ${unfinished.length}${projectsHasMore ? "+" : ""} unfinished projects`}
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-800 py-8 text-center">
            <FileText className="mx-auto h-7 w-7 text-zinc-700" />
            <p className="mt-2 text-sm text-zinc-500">No unfinished projects. Discover an opportunity below.</p>
          </div>
        )}
        {projectsHasMore && (
          <Button
            variant="outline"
            className="mt-4 w-full"
            disabled={projects.loadingMoreProjects}
            onClick={() => void projects.loadMoreProjects()}
          >
            {projects.loadingMoreProjects ? "Loading older projects…" : "Load older projects"}
          </Button>
        )}
      </section>
    </div>
  );
}
