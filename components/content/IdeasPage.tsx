"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentTopic, ContentType } from "@/types/content";
import { useContentProjects } from "@/hooks/useContentProjects";
import { TopicsTab } from "./TopicsTab";
import { AppliedStylePreview } from "./AppliedStylePreview";
import { ContentErrorBoundary } from "./ErrorBoundary";
import { ProjectTakeover } from "./ProjectTakeover";

/** /content/ideas — AI ideas, vault gaps and approved topic priorities. */
export function IdeasPage({
  clientId,
  viewerUserId,
  canApprove,
  brandStyle,
  initialTopics,
  initialProjects,
  projectsHasMore,
  vaultGaps,
}: {
  clientId: string;
  viewerUserId: string;
  canApprove: boolean;
  brandStyle: Record<string, unknown>;
  initialTopics: ContentTopic[];
  initialProjects: Parameters<typeof useContentProjects>[1];
  projectsHasMore: boolean;
  vaultGaps: string[];
}) {
  const projects = useContentProjects(clientId, initialProjects, projectsHasMore);
  const router = useRouter();
  const [topics, setTopics] = useState<ContentTopic[]>(initialTopics);
  const [previewType, setPreviewType] = useState<ContentType>("linkedin");
  const [ideaGenerationRequest, setIdeaGenerationRequest] = useState(0);

  if (projects.activeProject) {
    return (
      <ProjectTakeover
        clientId={clientId}
        canApprove={canApprove}
        brandStyle={brandStyle}
        projects={projects}
        onContentGenerated={() => {}}
        onRegenerateIdeas={() => {
          projects.closeProject();
          setIdeaGenerationRequest((request) => request + 1);
        }}
      />
    );
  }

  return (
    <ContentErrorBoundary>
      <div className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <label className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-400">
            Preview channel
            <select
              value={previewType}
              onChange={(event) => setPreviewType(event.target.value as ContentType)}
              className="mt-2 h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize text-white"
            >
              {["linkedin", "facebook", "instagram", "x", "email", "newsletter", "blog"].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <AppliedStylePreview brandStyle={brandStyle} channel={previewType} compact />
        </div>
        <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
          <div>
            <p className="text-sm font-medium text-blue-200">Observed Vault gaps</p>
            <p className="mt-1 text-xs text-zinc-500">
              Real questions the team asked that the Vault could not answer.
            </p>
          </div>
          {vaultGaps.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {vaultGaps.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void projects.handleVaultGapSelected(question)}
                  className="rounded-lg border border-blue-500/20 bg-zinc-950 p-3 text-left text-sm text-zinc-300 hover:border-blue-400/50"
                >
                  <span className="block text-xs text-blue-300">Build an idea from this gap</span>
                  <span className="mt-1 block">{question}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              No unanswered Vault questions are currently recorded.
            </p>
          )}
        </section>
        <TopicsTab
          clientId={clientId}
          viewerUserId={viewerUserId}
          canApprove={canApprove}
          initialTopics={topics}
          regenerateRequest={ideaGenerationRequest}
          onTopicSelected={projects.handleTopicSelected}
          onTopicApproved={(topic) =>
            setTopics((current) => [topic, ...current.filter((item) => item.id !== topic.id)])}
          onTopicsChange={setTopics}
          onOpenIntelligence={() => router.push("/content/competitors")}
        />
      </div>
    </ContentErrorBoundary>
  );
}
