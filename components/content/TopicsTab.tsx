"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { Plus, Wand2, RefreshCw, Search, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTopics } from "@/hooks/useTopics";
import { TopicList } from "./TopicList";
import { TopicForm } from "./TopicForm";
import { AiSuggestions } from "./AiSuggestions";
import type { ContentTopic, AiSuggestion } from "@/types/content";
import { toast } from "sonner";

interface TopicsTabProps {
  clientId: string;
  canApprove: boolean;
  initialTopics: ContentTopic[];
  regenerateRequest?: number;
  onTopicSelected: (topic: ContentTopic) => void;
  onTopicApproved?: (topic: ContentTopic) => void | Promise<void>;
  onTopicsChange?: (topics: ContentTopic[]) => void;
  onOpenIntelligence: () => void;
}

export const TopicsTab = memo(function TopicsTab({
  clientId,
  canApprove,
  initialTopics,
  regenerateRequest = 0,
  onTopicSelected,
  onTopicApproved,
  onTopicsChange,
  onOpenIntelligence,
}: TopicsTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [search, setSearch] = useState("");
  const handledRegenerateRequest = useRef(0);

  const {
    topics,
    createTopic,
    isCreating,
    updateStatus,
    isUpdating,
    deleteTopic,
    isDeleting,
    generateIdeas,
    isGenerating,
    suggestions,
  } = useTopics(clientId, initialTopics);

  useEffect(() => {
    onTopicsChange?.(topics);
  }, [onTopicsChange, topics]);

  const handleCreateTopic = useCallback(
    async (data: {
      client_id: string;
      title: string;
      description: string | null;
      content_type: string;
    }) => {
      await createTopic({ ...data, client_id: clientId });
      setShowForm(false);
      toast.success("Topic saved.");
    },
    [createTopic, clientId]
  );

  const handleApprove = useCallback(
    async (id: string) => {
      const approved = await updateStatus({ client_id: clientId, id, status: "approved" });
      await onTopicApproved?.(approved);
    },
    [updateStatus, clientId, onTopicApproved]
  );

  const handleReject = useCallback(
    async (id: string) => {
      await updateStatus({ client_id: clientId, id, status: "rejected" });
    },
    [updateStatus, clientId]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTopic({ client_id: clientId, id });
    },
    [deleteTopic, clientId]
  );

  const handleGenerateIdeas = useCallback(async () => {
    await generateIdeas({ count: 8, mode: "company" });
  }, [generateIdeas]);

  useEffect(() => {
    if (
      regenerateRequest < 1 ||
      regenerateRequest === handledRegenerateRequest.current
    ) return;
    handledRegenerateRequest.current = regenerateRequest;
    setShowSuggestions(true);
    void handleGenerateIdeas();
  }, [handleGenerateIdeas, regenerateRequest]);

  const handleSubmitSuggestions = useCallback(
    async (selected: AiSuggestion[]) => {
      // Batch create topics
      const promises = selected.map((s) =>
        createTopic({
          client_id: clientId,
          title: s.title,
          description: s.description,
          content_type: s.content_type,
          ai_fit_score: s.fit ?? null,
          ai_flagged: s.ai_flagged ?? false,
          why: ({
            ...(s.why ?? {}),
            ...(s.explainability ? { explainability: s.explainability } : {}),
          }) as Record<string, unknown>,
          status: canApprove ? "approved" : "pending",
        })
      );

      const results = await Promise.allSettled(promises);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;

      if (succeeded > 0) {
        toast.success(
          `${succeeded} idea${succeeded !== 1 ? "s" : ""} saved${
            failed > 0 ? ` (${failed} failed)` : ""
          }`
        );
      } else {
        toast.error("Failed to add topics");
      }

      setShowSuggestions(false);
    },
    [canApprove, createTopic, clientId]
  );

  const handleSaveApprovedSuggestion = useCallback(
    async (suggestion: AiSuggestion) => {
      const saved = await createTopic({
        client_id: clientId,
        title: suggestion.title,
        description: suggestion.description,
        content_type: suggestion.content_type,
        ai_fit_score: suggestion.fit ?? null,
        ai_flagged: suggestion.ai_flagged ?? false,
        why: ({
          ...(suggestion.why ?? {}),
          ...(suggestion.explainability
            ? { explainability: suggestion.explainability }
            : {}),
        }) as Record<string, unknown>,
        status: canApprove ? "approved" : "pending",
      });
      if (saved.status === "approved") await onTopicApproved?.(saved);
      toast.success(
        saved.status === "approved"
          ? "Idea saved to IDEAS approved."
          : "Idea saved for approval.",
      );
    },
    [canApprove, clientId, createTopic, onTopicApproved],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Content Topics</h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            Propose a topic. Once approved, generate content from it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setShowSuggestions(true);
              void handleGenerateIdeas();
            }}
            disabled={isGenerating}
            className="bg-purple-600 hover:bg-purple-700 text-white border-0"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Ideas
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenIntelligence}
            className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
          >
            <Radar className="w-4 h-4 mr-2" />
            Market Intelligence
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Topic
          </Button>
        </div>
      </div>

      {/* AI Suggestions Panel */}
      {showSuggestions && (
        <AiSuggestions
          clientId={clientId}
          suggestions={suggestions as AiSuggestion[] | null}
          isGenerating={isGenerating}
          isSubmitting={isCreating}
          canApprove={canApprove}
          mode="company"
          onGenerate={handleGenerateIdeas}
          onSaveApproved={handleSaveApprovedSuggestion}
          onSubmitSelected={handleSubmitSuggestions}
          onClose={() => setShowSuggestions(false)}
        />
      )}

      {/* New Topic Form */}
      {showForm && (
        <TopicForm
          clientId={clientId}
          isSubmitting={isCreating}
          onSubmit={handleCreateTopic}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Search */}
      {topics.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics..."
            className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-700"
          />
        </div>
      )}

      {/* Topic List */}
      <TopicList
        topics={search.trim()
          ? topics.filter(
              (t) =>
                t.title.toLowerCase().includes(search.toLowerCase()) ||
                t.content_type.toLowerCase().includes(search.toLowerCase()) ||
                t.status.toLowerCase().includes(search.toLowerCase()) ||
                (t.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
            )
          : topics}
        canApprove={canApprove}
        isLoading={isUpdating || isDeleting}
        onApprove={handleApprove}
        onReject={handleReject}
        onDelete={handleDelete}
        onGenerate={onTopicSelected}
      />
    </div>
  );
});
