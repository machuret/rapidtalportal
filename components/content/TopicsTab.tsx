"use client";

import { memo, useState, useCallback } from "react";
import { Plus, Wand2, RefreshCw, Search } from "lucide-react";
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
  onTopicSelected: (topic: ContentTopic) => void;
}

export const TopicsTab = memo(function TopicsTab({
  clientId,
  canApprove,
  initialTopics,
  onTopicSelected,
}: TopicsTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [search, setSearch] = useState("");

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

  const handleCreateTopic = useCallback(
    async (data: {
      client_id: string;
      title: string;
      description: string | null;
      content_type: string;
    }) => {
      await createTopic({ ...data, client_id: clientId });
      setShowForm(false);
    },
    [createTopic, clientId]
  );

  const handleApprove = useCallback(
    async (id: string) => {
      await updateStatus({ client_id: clientId, id, status: "approved" });
    },
    [updateStatus, clientId]
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
    await generateIdeas({ count: 8 });
  }, [generateIdeas]);

  const handleSubmitSuggestions = useCallback(
    async (selected: AiSuggestion[]) => {
      // Batch create topics
      const promises = selected.map((s) =>
        createTopic({
          client_id: clientId,
          title: s.title,
          description: s.description,
          content_type: s.content_type,
        })
      );

      const results = await Promise.allSettled(promises);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;

      if (succeeded > 0) {
        toast.success(
          `${succeeded} topic${succeeded !== 1 ? "s" : ""} added${
            failed > 0 ? ` (${failed} failed)` : ""
          }`
        );
      } else {
        toast.error("Failed to add topics");
      }

      setShowSuggestions(false);
    },
    [createTopic, clientId]
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
              if (!suggestions) {
                handleGenerateIdeas();
              }
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
          suggestions={suggestions as AiSuggestion[] | null}
          isGenerating={isGenerating}
          isSubmitting={isCreating}
          onGenerate={handleGenerateIdeas}
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
