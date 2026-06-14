"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

export interface BrainSignalInput {
  client_id: string;
  surface: "content_topic" | "vault_answer" | "compose" | "tool";
  artifact_id?: string | null;
  artifact_text: string;
  rating: 1 | -1;
  reason?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Records a 👍 / 👎 (with optional reason) for the Brain to learn from. The
 * api-client surfaces its own error toast, so callers only handle success.
 */
export function useBrainSignal() {
  const mutation = useMutation({
    mutationFn: (input: BrainSignalInput) => api.post(ROUTES.brain.signals(), input),
  });
  return {
    sendSignal: mutation.mutateAsync,
    isSending: mutation.isPending,
  };
}
