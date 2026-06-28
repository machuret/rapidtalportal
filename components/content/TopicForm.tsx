"use client";

import { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_TYPES, TYPE_ICON_COLORS, TYPE_ICONS } from "@/types/content";
import type { ContentType } from "@/types/content";

interface TopicFormProps {
  clientId: string;
  isSubmitting: boolean;
  onSubmit: (data: {
    client_id: string;
    title: string;
    description: string | null;
    content_type: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export const TopicForm = memo(function TopicForm({
  clientId,
  isSubmitting,
  onSubmit,
  onCancel,
}: TopicFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<ContentType>("blog");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;

      await onSubmit({
        client_id: clientId,
        title: title.trim(),
        description: description.trim() || null,
        content_type: contentType,
      });

      // Reset on success
      setTitle("");
      setDescription("");
      setContentType("blog");
    },
    [clientId, title, description, contentType, onSubmit]
  );

  const handleCancel = useCallback(() => {
    setTitle("");
    setDescription("");
    setContentType("blog");
    onCancel();
  }, [onCancel]);

  return (
    <form onSubmit={handleSubmit} className="surface-card p-5 space-y-4">
      <p className="label-section">Propose a new topic</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="topic-title">Title</Label>
        <Input
          id="topic-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Why our cloud service reduces costs by 40%"
          className="bg-zinc-950 border-zinc-700"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="topic-desc">
          Description <span className="text-zinc-600">(optional)</span>
        </Label>
        <Textarea
          id="topic-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What should this content cover? Key points, angle, audience…"
          className="bg-zinc-950 border-zinc-700 text-sm"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Content Type</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONTENT_TYPES.map((ct) => {
            const Icon = TYPE_ICONS[ct.id];
            const isSelected = contentType === ct.id;

            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => setContentType(ct.id)}
                disabled={isSubmitting}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  isSelected
                    ? "border-zinc-500 bg-zinc-800 text-white"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${TYPE_ICON_COLORS[ct.id]}`} />
                {ct.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          size="sm"
        >
          {isSubmitting ? "Submitting…" : "Submit Topic"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
});
