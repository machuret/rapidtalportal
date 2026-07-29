"use client";

import { useState, useCallback } from "react";
import type { ContentPiece, ContentTopic, ContentType } from "@/types/content";
import { TopicsTab } from "./TopicsTab";
import { CreateTab } from "./CreateTab";
import { HistoryTab } from "./HistoryTab";
import { CompetitorsTab } from "./CompetitorsTab";
import { ContentErrorBoundary } from "./ErrorBoundary";
import {
  competitorIdeaToBrief,
  type CompetitorIntelligenceIdea,
} from "@/lib/competitors/intelligence";

type Tab = "topics" | "create" | "history" | "competitors";

const TABS: { id: Tab; label: string }[] = [
  { id: "topics", label: "💡 Generate ideas" },
  { id: "create", label: "✍️ Write from a topic" },
  { id: "history", label: "🕐 History" },
  { id: "competitors", label: "📡 Market intelligence" },
];

interface ContentStudioProps {
  clientId: string;
  canApprove: boolean;
  canManageCompetitors: boolean;
  brandStyle: Record<string, unknown>;
  history: ContentPiece[];
  topics: ContentTopic[];
}

function ContentStudioInner({
  clientId,
  canApprove,
  canManageCompetitors,
  brandStyle,
  history: initialHistory,
  topics: initialTopics,
}: ContentStudioProps) {
  const [activeTab, setActiveTab] = useState<Tab>("topics");
  const [history, setHistory] = useState<ContentPiece[]>(initialHistory);

  // Prefill create tab when topic is selected
  const [prefill, setPrefill] = useState<{
    type: string | null;
    title: string;
    brief: string;
  } | null>(null);

  const handleTopicSelected = useCallback((topic: ContentTopic) => {
    setPrefill({
      type: topic.content_type,
      title: topic.title,
      brief: topic.description ?? "",
    });
    setActiveTab("create");
  }, []);

  const handleContentGenerated = useCallback((piece: ContentPiece) => {
    setHistory((prev) => [piece, ...prev]);
  }, []);

  const handleCompetitorIdeaSelected = useCallback((idea: CompetitorIntelligenceIdea) => {
    setPrefill(competitorIdeaToBrief(idea));
    setActiveTab("create");
  }, []);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-6 p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit max-w-full">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — use hidden instead of conditional render to preserve state */}
      <div className={activeTab === "topics" ? "" : "hidden"}>
        <ContentErrorBoundary>
          <TopicsTab
            clientId={clientId}
            canApprove={canApprove}
            initialTopics={initialTopics}
            onTopicSelected={handleTopicSelected}
            onOpenIntelligence={() => setActiveTab("competitors")}
          />
        </ContentErrorBoundary>
      </div>

      <div className={activeTab === "create" ? "" : "hidden"}>
        <CreateTab
          clientId={clientId}
          brandStyle={brandStyle}
          initialType={(prefill?.type ?? null) as ContentType | null}
          initialTitle={prefill?.title}
          initialBrief={prefill?.brief}
          onContentGenerated={handleContentGenerated}
        />
      </div>

      <div className={activeTab === "history" ? "" : "hidden"}>
        <HistoryTab
          history={history}
          clientId={clientId}
          canApprove={canApprove}
          onHistoryUpdate={setHistory}
        />
      </div>

      <div className={activeTab === "competitors" ? "" : "hidden"}>
        <ContentErrorBoundary>
          <CompetitorsTab
            clientId={clientId}
            canManage={canManageCompetitors}
            active={activeTab === "competitors"}
            onIdeaSelected={handleCompetitorIdeaSelected}
          />
        </ContentErrorBoundary>
      </div>
    </div>
  );
}

// The portal layout provides a global QueryClientProvider, so this just renders.
export function ContentStudio(props: ContentStudioProps) {
  return <ContentStudioInner {...props} />;
}
