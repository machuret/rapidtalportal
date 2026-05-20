"use client";

import { memo, useCallback } from "react";
import {
  BookText,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { ContentTopic } from "@/types/content";
import { TYPE_ICON_COLORS, STATUS_STYLES, TYPE_ICONS } from "@/types/content";

interface TopicListProps {
  topics: ContentTopic[];
  canApprove: boolean;
  isLoading: boolean;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onGenerate: (topic: ContentTopic) => void;
}

// Memoized individual topic card
const TopicCard = memo(function TopicCard({
  topic,
  canApprove,
  isLoading,
  onApprove,
  onReject,
  onDelete,
  onGenerate,
}: {
  topic: ContentTopic;
  canApprove: boolean;
  isLoading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  onGenerate: (topic: ContentTopic) => void;
}) {
  const TypeIcon = TYPE_ICONS[topic.content_type] || BookText;
  const iconColor = TYPE_ICON_COLORS[topic.content_type] || "text-zinc-400";
  const statusStyle = STATUS_STYLES[topic.status];

  const handleApprove = useCallback(() => {
    onApprove(topic.id);
  }, [onApprove, topic.id]);

  const handleReject = useCallback(() => {
    onReject(topic.id);
  }, [onReject, topic.id]);

  const handleDelete = useCallback(() => {
    onDelete(topic.id);
  }, [onDelete, topic.id]);

  const handleGenerate = useCallback(() => {
    onGenerate(topic);
  }, [onGenerate, topic]);

  return (
    <div className="surface-card px-5 py-4 flex items-start gap-4">
      <TypeIcon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <p className="font-semibold text-sm text-white truncate">{topic.title}</p>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusStyle}`}
          >
            {topic.status}
          </span>
        </div>
        {topic.description && (
          <p className="text-xs text-zinc-500 line-clamp-2">{topic.description}</p>
        )}
        <p className="text-xs text-zinc-600 mt-1">
          {topic.content_type} · {new Date(topic.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Approve/Reject - admins only on pending */}
        {canApprove && topic.status === "pending" && (
          <>
            <button
              onClick={handleApprove}
              disabled={isLoading}
              aria-label="Approve topic"
              title="Approve"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-40"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={handleReject}
              disabled={isLoading}
              aria-label="Reject topic"
              title="Reject"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Generate from approved topic */}
        {topic.status === "approved" && (
          <button
            onClick={handleGenerate}
            aria-label="Generate content from this topic"
            title="Generate content from this topic"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-400 hover:text-white hover:bg-blue-600 border border-blue-500/30 hover:border-blue-600 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate
            <ArrowRight className="w-3 h-3" />
          </button>
        )}

        {/* Delete - admins only */}
        {canApprove && (
          <button
            onClick={handleDelete}
            disabled={isLoading}
            aria-label="Delete topic"
            title="Delete topic"
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});

// Main topic list component
export const TopicList = memo(function TopicList({
  topics,
  canApprove,
  isLoading,
  onApprove,
  onReject,
  onDelete,
  onGenerate,
}: TopicListProps) {
  if (topics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
        <BookText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400 font-medium">No topics yet</p>
        <p className="text-zinc-600 text-sm mt-1">
          Click &ldquo;New Topic&rdquo; to propose your first content topic.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {topics.map((topic) => (
        <TopicCard
          key={topic.id}
          topic={topic}
          canApprove={canApprove}
          isLoading={isLoading}
          onApprove={onApprove}
          onReject={onReject}
          onDelete={onDelete}
          onGenerate={onGenerate}
        />
      ))}
    </div>
  );
});
