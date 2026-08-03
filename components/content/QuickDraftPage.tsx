"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, Loader2, Radar, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { ContentPiece, ContentProject, ContentType } from "@/types/content";
import { useContentProjects } from "@/hooks/useContentProjects";
import { AppliedStylePreview } from "./AppliedStylePreview";
import { ProjectTakeover } from "./ProjectTakeover";

const CHANNELS: ContentType[] = ["linkedin", "facebook", "instagram", "x", "email", "newsletter", "blog"];

interface QuickDraftResponse {
  project: ContentProject;
  piece: ContentPiece;
  warnings?: string[];
  recovered?: boolean;
}

/** /content/quick — generate a grounded draft in under a minute. */
export function QuickDraftPage({
  clientId,
  canApprove,
  brandStyle,
  onboardingMode = false,
}: {
  clientId: string;
  canApprove: boolean;
  brandStyle: Record<string, unknown>;
  onboardingMode?: boolean;
}) {
  const projects = useContentProjects(clientId, [], false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState<ContentType>("linkedin");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickGuidance, setQuickGuidance] = useState("");
  const [quickType, setQuickType] = useState<ContentType>("linkedin");
  const [quickCreating, setQuickCreating] = useState(false);
  const quickCreatingRef = useRef(false);
  const quickCreateKeyRef = useRef<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const handleManualIdea = useCallback(async () => {
    if (!manualTitle.trim()) {
      toast.error("Add an idea title.");
      return;
    }
    const created = await projects.createProject({
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
  }, [projects.createProject, manualTitle, manualType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuickCreate = useCallback(async () => {
    if (quickCreatingRef.current) return;
    const title = quickTitle.trim();
    if (!title) {
      toast.error("Tell us what you want to create.");
      return;
    }

    quickCreatingRef.current = true;
    setQuickCreating(true);
    try {
      const idempotencyKey = quickCreateKeyRef.current ?? crypto.randomUUID();
      quickCreateKeyRef.current = idempotencyKey;
      const result = await api.post<QuickDraftResponse>(ROUTES.content.quickDraft(), {
        clientId,
        idempotencyKey,
        title,
        contentType: quickType,
        guidance: quickGuidance.trim() || null,
      }, { showErrorToast: false, idempotent: true, retries: 2 });
      projects.updateProject(result.project);
      setQuickTitle("");
      setQuickGuidance("");
      quickCreateKeyRef.current = null;
      const warningCount = result.warnings?.length ?? 0;
      toast.success(warningCount
        ? `Draft ready with ${warningCount} editorial check${warningCount === 1 ? "" : "s"} to review.`
        : "Draft ready. You can edit it now.");
    } catch (error) {
      const exactWarning = error instanceof ApiError && Array.isArray(error.details.warnings)
        ? error.details.warnings.find((warning): warning is string => typeof warning === "string")
        : null;
      const message = error instanceof Error
        ? error.message
        : "The draft could not be generated. Your work has been saved.";
      toast.error(exactWarning ? `${message} ${exactWarning}` : message);
    } finally {
      quickCreatingRef.current = false;
      setQuickCreating(false);
    }
  }, [clientId, projects.updateProject, quickGuidance, quickTitle, quickType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (projects.activeProject) {
    return (
      <div className="space-y-5">
        {onboardingMode && <FirstDraftBanner hasDraft />}
        <ProjectTakeover
          clientId={clientId}
          canApprove={canApprove}
          brandStyle={brandStyle}
          projects={projects}
          onContentGenerated={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {onboardingMode && <FirstDraftBanner />}
      <section className="rounded-2xl border border-purple-500/35 bg-gradient-to-br from-purple-500/15 via-zinc-900 to-zinc-950 p-6 shadow-lg shadow-purple-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-300">
              <Zap className="h-3.5 w-3.5" /> Create content
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Create a draft in under a minute</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Give the engine a topic and channel. Your company profile, approved voice, platform structure and relevant company knowledge are applied automatically.
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
            onChange={(event) => {
              setQuickTitle(event.target.value);
              quickCreateKeyRef.current = null;
            }}
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
            onChange={(event) => {
              setQuickType(event.target.value as ContentType);
              quickCreateKeyRef.current = null;
            }}
            disabled={quickCreating}
            aria-label="Content channel"
            className="h-11 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize text-white"
          >
            {CHANNELS.map((type) => (
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
          onChange={(event) => {
            setQuickGuidance(event.target.value);
            quickCreateKeyRef.current = null;
          }}
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

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Other ways to start content">
        <Link
          href="/content/ideas"
          className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-blue-500/40 hover:bg-zinc-900"
        >
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Need an idea?</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Generate useful topics from your company, knowledge and audience.</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 text-zinc-600 transition group-hover:text-blue-300" />
          </div>
        </Link>
        <Link
          href="/competitors"
          className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-orange-500/40 hover:bg-zinc-900"
        >
          <div className="flex items-start gap-3">
            <Radar className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Explore market opportunities</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Find content gaps from collected competitor and market signals.</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 text-zinc-600 transition group-hover:text-orange-300" />
          </div>
        </Link>
      </section>

      {showManual && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Guided Create</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Start an evidence-led draft</h2>
          <p className="mt-1 text-sm text-zinc-500">Review the idea, shape the brief and choose factual sources before generation.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="What should the company talk about?" className="flex-1 bg-zinc-950" />
            <select value={manualType} onChange={(event) => setManualType(event.target.value as ContentType)} className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm capitalize">
              {CHANNELS.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Button onClick={handleManualIdea} disabled={projects.creatingProject}>
              {projects.creatingProject ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</> : "Start guided draft"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function FirstDraftBanner({ hasDraft = false }: { hasDraft?: boolean }) {
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Step 5 of 6</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{hasDraft ? "Your first draft is ready" : "Create your first draft"}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {hasDraft
              ? "Edit it, run the checks or keep working later. The draft is already saved."
              : "Choose a channel and describe the topic. Nothing else is required before generation."}
          </p>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "text-zinc-400")}>
          {hasDraft ? "Continue your journey" : "Back to your journey"}
          {hasDraft && <span aria-hidden="true">→</span>}
        </Link>
      </div>
    </section>
  );
}
