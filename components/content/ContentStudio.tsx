"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveX,
  ArrowRight,
  Clock3,
  FileText,
  Lightbulb,
  Loader2,
  Radar,
  Search,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ContentPiece,
  ContentBrief,
  ContentProject,
  ContentProjectIdea,
  ContentTopic,
  ContentType,
} from "@/types/content";
import { TopicsTab } from "./TopicsTab";
import { HistoryTab } from "./HistoryTab";
import { CompetitorsTab } from "./CompetitorsTab";
import { ContentErrorBoundary } from "./ErrorBoundary";
import { ContentProjectWorkflow } from "./ContentProjectWorkflow";
import { ContentPilotPanel } from "./ContentPilotPanel";
import { AppliedStylePreview } from "./AppliedStylePreview";
import { generateQuickDraft } from "@/lib/content/quick-draft";
import {
  competitorIdeaToBrief,
  type CompetitorIntelligenceIdea,
} from "@/lib/competitors/intelligence";

type DiscoverView = "ideas" | "competitors" | "library";

interface ContentStudioProps {
  clientId: string;
  viewerUserId: string;
  canApprove: boolean;
  canManageCompetitors: boolean;
  brandStyle: Record<string, unknown>;
  history: ContentPiece[];
  historyHasMore: boolean;
  topics: ContentTopic[];
  projects: ContentProject[];
  projectsHasMore: boolean;
  vaultGaps: string[];
}

interface ContentPage<T> {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
}

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

function ContentStudioInner({
  clientId,
  viewerUserId,
  canApprove,
  canManageCompetitors,
  brandStyle,
  history: initialHistory,
  historyHasMore: initialHistoryHasMore,
  topics: initialTopics,
  projects: initialProjects,
  projectsHasMore: initialProjectsHasMore,
  vaultGaps,
}: ContentStudioProps) {
  const [view, setView] = useState<DiscoverView>("ideas");
  const [history, setHistory] = useState<ContentPiece[]>(initialHistory);
  const [historyHasMore, setHistoryHasMore] = useState(initialHistoryHasMore);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [topics, setTopics] = useState<ContentTopic[]>(initialTopics);
  const [projects, setProjects] = useState<ContentProject[]>(initialProjects);
  const [projectsHasMore, setProjectsHasMore] = useState(initialProjectsHasMore);
  const [loadingMoreProjects, setLoadingMoreProjects] = useState(false);
  const [activeProject, setActiveProject] = useState<ContentProject | null>(null);
  const [openingProject, setOpeningProject] = useState<string | null>(null);
  const [archivingProject, setArchivingProject] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState<ContentType>("linkedin");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickGuidance, setQuickGuidance] = useState("");
  const [quickType, setQuickType] = useState<ContentType>("linkedin");
  const [quickCreating, setQuickCreating] = useState(false);
  const quickCreatingRef = useRef(false);
  const [previewType, setPreviewType] = useState<ContentType>("linkedin");
  const [showManual, setShowManual] = useState(false);
  const [ideaGenerationRequest, setIdeaGenerationRequest] = useState(0);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const unfinished = useMemo(
    () => projects.filter((project) => ["active", "saved"].includes(project.status)),
    [projects],
  );
  const approvedTopics = useMemo(
    () => topics.filter((topic) => topic.status === "approved"),
    [topics],
  );

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

  const handleTopicApproved = useCallback(async (topic: ContentTopic) => {
    setTopics((current) => [
      topic,
      ...current.filter((item) => item.id !== topic.id),
    ]);
  }, []);

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

  const handleContentGenerated = useCallback((piece: ContentPiece) => {
    setHistory((previous) => [piece, ...previous.filter((item) => item.id !== piece.id)]);
  }, []);

  const handleManualIdea = useCallback(async () => {
    if (!manualTitle.trim()) {
      toast.error("Add an idea title.");
      return;
    }
    const created = await createProject({
      version: 1,
      origin: "manual",
      title: manualTitle.trim(),
      channel: manualType,
      rationale: "A deliberate company priority entered by the editorial team.",
      differentiation: "Define the distinctive company angle in the brief.",
      evidenceSummary: "Factual support will be selected from the company Vault before generation.",
      marketIntelligence: null,
    });
    if (created) {
      setManualTitle("");
      setShowManual(false);
    }
  }, [createProject, manualTitle, manualType]);

  const handleQuickCreate = useCallback(async () => {
    if (quickCreatingRef.current) return;
    const title = quickTitle.trim();
    if (!title) {
      toast.error("Tell us what you want to create.");
      return;
    }

    quickCreatingRef.current = true;
    setQuickCreating(true);
    let created: ContentProject | null = null;
    try {
      created = await api.post<ContentProject>(ROUTES.content.projects(), {
        client_id: clientId,
        idea: {
          version: 1,
          origin: "manual",
          title,
          channel: quickType,
          rationale: "A direct content request from the editorial team.",
          differentiation: "Use Company DNA, approved voice and the most relevant company evidence.",
          evidenceSummary: "The engine will automatically shortlist relevant factual Vault sources.",
          marketIntelligence: null,
        } satisfies ContentProjectIdea,
      }, { showErrorToast: false });
      setProjects((previous) => [
        created as ContentProject,
        ...previous.filter((project) => project.id !== created?.id),
      ]);

      const brief: ContentBrief = {
        version: 1,
        objective: title,
        audience: null,
        angle: null,
        desiredFormat: null,
        keyPoints: [],
        callToAction: null,
        tone: "professional",
        length: "medium",
        mode: "new",
        additionalGuidance: quickGuidance.trim() || null,
        marketIntelligence: null,
      };
      const result = await generateQuickDraft({
        clientId,
        project: created,
        brief,
      });
      updateProject(result.project);
      handleContentGenerated(result.piece);
      setQuickTitle("");
      setQuickGuidance("");
      const warningCount = result.warnings?.length ?? 0;
      toast.success(warningCount
        ? `Draft ready with ${warningCount} editorial check${warningCount === 1 ? "" : "s"} to review.`
        : "Draft ready. You can edit it now.");
    } catch (error) {
      toast.error(error instanceof Error
        ? error.message
        : "The draft could not be generated. Your work has been saved.");
      if (created) await openProject(created.id);
    } finally {
      quickCreatingRef.current = false;
      setQuickCreating(false);
    }
  }, [
    clientId,
    handleContentGenerated,
    openProject,
    quickGuidance,
    quickTitle,
    quickType,
    updateProject,
  ]);

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

  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreHistory || !historyHasMore) return;
    setLoadingMoreHistory(true);
    try {
      const page = await api.get<ContentPage<ContentPiece>>(
        ROUTES.content.piecesPage(clientId, history.length),
        { showErrorToast: false },
      );
      setHistory((previous) => [
        ...previous,
        ...page.items.filter((item) => !previous.some((existing) => existing.id === item.id)),
      ]);
      setHistoryHasMore(page.hasMore);
    } catch {
      toast.error("Older content could not be loaded. Please try again.");
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [clientId, history.length, historyHasMore, loadingMoreHistory]);

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

  if (activeProject) {
    return (
      <ContentErrorBoundary>
        <ContentProjectWorkflow
          key={activeProject.id}
          clientId={clientId}
          canApprove={canApprove}
          brandStyle={brandStyle}
          project={activeProject}
          onProjectChange={updateProject}
          onClose={() => setActiveProject(null)}
          onRegenerateIdeas={() => {
            setActiveProject(null);
            setView("ideas");
            setIdeaGenerationRequest((request) => request + 1);
          }}
          onContentGenerated={handleContentGenerated}
        />
      </ContentErrorBoundary>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-purple-500/35 bg-gradient-to-br from-purple-500/15 via-zinc-900 to-zinc-950 p-6 shadow-lg shadow-purple-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-300">
              <Zap className="h-3.5 w-3.5" /> Quick Create
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Create a draft in under a minute</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Give the engine a topic and channel. Company DNA, approved voice, platform structure and relevant Vault evidence are applied automatically.
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={quickCreating}
            onClick={() => setShowManual((value) => !value)}
          >
            {showManual ? "Hide Guided Create" : "Need more control? Guided Create"}
          </Button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_180px_auto]">
          <Input
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleQuickCreate();
              }
            }}
            disabled={quickCreating}
            maxLength={300}
            placeholder="What do you want to create? e.g. Why private credit matters to property investors"
            aria-label="Content topic"
            className="h-11 bg-zinc-950"
          />
          <select
            value={quickType}
            onChange={(event) => setQuickType(event.target.value as ContentType)}
            disabled={quickCreating}
            aria-label="Content channel"
            className="h-11 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize text-white"
          >
            {["linkedin", "facebook", "instagram", "x", "email", "newsletter", "blog"].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <Button
            size="lg"
            disabled={quickCreating || !quickTitle.trim()}
            onClick={() => void handleQuickCreate()}
            className="h-11 bg-purple-600 hover:bg-purple-500"
          >
            {quickCreating
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Zap className="mr-2 h-4 w-4" />}
            {quickCreating ? "Creating draft…" : "Generate draft"}
          </Button>
        </div>
        <Input
          value={quickGuidance}
          onChange={(event) => setQuickGuidance(event.target.value)}
          disabled={quickCreating}
          maxLength={2000}
          placeholder="Optional direction: audience, angle, key point or CTA"
          aria-label="Optional content direction"
          className="mt-3 bg-zinc-950/80"
        />
        <div className="mt-4">
          <AppliedStylePreview brandStyle={brandStyle} channel={quickType} compact />
        </div>
      </section>

      {showManual && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Guided Create</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Start an evidence-led draft</h2>
          <p className="mt-1 text-sm text-zinc-500">Review the idea, shape the brief and choose factual sources before generation.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="What should the company talk about?" className="flex-1 bg-zinc-950" />
            <select value={manualType} onChange={(event) => setManualType(event.target.value as ContentType)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize">
              {["linkedin", "facebook", "instagram", "x", "email", "newsletter", "blog"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Button onClick={handleManualIdea}>Start guided draft</Button>
          </div>
        </section>
      )}

      <ContentPilotPanel clientId={clientId} projects={projects} />
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
                const existing = projects.find((project) =>
                  project.idea_snapshot.topicId === topic.id &&
                  ["active", "saved"].includes(project.status));
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => void handleTopicSelected(topic)}
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
                <button type="button" onClick={() => openProject(project.id)} className="w-full p-4 pr-11 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-purple-500/10 px-2 py-1 text-2xs font-medium uppercase text-purple-300">{projectProgress(project)}</span>
                    {openingProject === project.id ? <Clock3 className="h-4 w-4 animate-spin text-zinc-500" /> : <ArrowRight className="h-4 w-4 text-zinc-600" />}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-medium text-white">{project.title}</p>
                  <p className="mt-2 text-xs capitalize text-zinc-500">{project.idea_snapshot.channel} · {project.idea_snapshot.origin.replaceAll("_", " ")}</p>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${project.title} from unfinished projects`}
                  title="Remove from unfinished projects"
                  disabled={archivingProject === project.id}
                  onClick={() => void archiveUnfinishedProject(project)}
                  className="absolute right-2 top-2 rounded-md p-1.5 text-zinc-600 opacity-60 transition hover:bg-zinc-900 hover:text-red-300 group-hover:opacity-100 disabled:opacity-40"
                >
                  {archivingProject === project.id
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
            disabled={loadingMoreProjects}
            onClick={() => void loadMoreProjects()}
          >
            {loadingMoreProjects ? "Loading older projects…" : "Load older projects"}
          </Button>
        )}
      </section>

      <nav aria-label="Content Studio" className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 sm:grid-cols-3">
        <button type="button" onClick={() => setView("ideas")} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${view === "ideas" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
          <Lightbulb className="h-4 w-4" /> Ideas
        </button>
        <button type="button" onClick={() => setView("competitors")} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${view === "competitors" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
          <Radar className="h-4 w-4" /> Competitor ideas
        </button>
        <button type="button" onClick={() => setView("library")} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${view === "library" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"}`}>
          <Archive className="h-4 w-4" /> Drafts &amp; approved
        </button>
      </nav>

      {view === "ideas" && (
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
                      onClick={() => void handleVaultGapSelected(question)}
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
              onTopicSelected={handleTopicSelected}
              onTopicApproved={handleTopicApproved}
              onTopicsChange={setTopics}
              onOpenIntelligence={() => setView("competitors")}
            />
          </div>
        </ContentErrorBoundary>
      )}

      {view === "competitors" && (
        <ContentErrorBoundary>
          <CompetitorsTab
            clientId={clientId}
            canManage={canManageCompetitors}
            active
            onIdeaSelected={handleCompetitorIdeaSelected}
          />
        </ContentErrorBoundary>
      )}

      {view === "library" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <p className="rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 text-sm text-zinc-500">Open any draft to edit, compare, duplicate, adapt, approve, archive, copy or export.</p>
          </div>
          <HistoryTab
            history={history}
            clientId={clientId}
            canApprove={canApprove}
            onHistoryUpdate={setHistory}
            hasMore={historyHasMore}
            loadingMore={loadingMoreHistory}
            onLoadMore={loadMoreHistory}
          />
        </div>
      )}
    </div>
  );
}

export function ContentStudio(props: ContentStudioProps) {
  return <ContentStudioInner {...props} />;
}
