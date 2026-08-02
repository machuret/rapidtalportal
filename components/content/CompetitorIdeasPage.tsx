"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Radar } from "lucide-react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { Competitor } from "@/types/competitors";
import { useContentProjects } from "@/hooks/useContentProjects";
import { CompetitorIntelligencePanel } from "@/components/content/competitors/intelligence/CompetitorIntelligencePanel";
import { ContentErrorBoundary } from "./ErrorBoundary";
import { ProjectTakeover } from "./ProjectTakeover";

/** /content/competitors — market intelligence and recommended ideas. */
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
  const projects = useContentProjects(clientId, [], false);
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<{ competitors: Competitor[] }>(ROUTES.content.competitorsForClient(clientId))
      .then((result) => { if (active) setCompetitors(result.competitors ?? []); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [clientId]);

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

  if (loadFailed) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        Competitor intelligence could not be loaded. Please try again.
      </div>
    );
  }

  if (competitors === null) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading competitor intelligence…
      </div>
    );
  }

  if (competitors.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <Radar className="mx-auto h-7 w-7 text-zinc-700" />
        <h2 className="mt-3 font-semibold text-white">No competitors yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
          Add your competitors first — then this page turns their public content
          into grounded ideas for yours.
        </p>
        <Link
          href="/company-dna/competitors"
          className="mt-4 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400"
        >
          Manage competitors
        </Link>
      </div>
    );
  }

  return (
    <ContentErrorBoundary>
      <CompetitorIntelligencePanel
        clientId={clientId}
        canManage={canManage}
        competitors={competitors}
        onIdeaSelected={projects.handleCompetitorIdeaSelected}
      />
    </ContentErrorBoundary>
  );
}
