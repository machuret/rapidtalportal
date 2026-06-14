"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type { ContentPiece, ContentStatus, ContentType } from "@/types/content";

const PIECES_KEY = "content-pieces";

/* ── Full piece with body (returned by detail endpoint) ─────────── */
export interface ContentPieceFull extends ContentPiece {
  brief?: string | null;
  body: string | null;
  updated_at?: string;
}

interface GenerationResponse {
  id: string;
  body: string;
  critique?: { issues: string[]; grounded: boolean };
}

interface GenerateContentInput {
  clientId: string;
  userId: string;
  contentType: ContentType;
  title: string;
  brief: string;
  tone: string;
  length: "short" | "medium" | "long";
}

interface UpdatePieceStatusInput {
  client_id: string;
  id: string;
  status: ContentStatus;
}

// Query Keys
export const pieceKeys = {
  all: [PIECES_KEY] as const,
  byClient: (clientId: string) => [PIECES_KEY, clientId] as const,
  detail: (clientId: string, id: string) =>
    [PIECES_KEY, clientId, "detail", id] as const,
};

// Fetch single content piece detail (with body)
async function fetchPieceDetail(
  clientId: string,
  id: string
): Promise<ContentPieceFull> {
  return api.get<ContentPieceFull>(
    `/api/content/pieces?client_id=${clientId}&id=${id}`
  );
}

// Generate content piece
async function generateContent(
  input: GenerateContentInput
): Promise<GenerationResponse> {
  return api.post<GenerationResponse>("/content/generate", input);
}

// Update piece status
async function updatePieceStatus(
  input: UpdatePieceStatusInput
): Promise<void> {
  return api.patch("/api/content/pieces", input);
}

// Hook: lazily fetch a content piece's full detail.
// `id` null disables the query (nothing selected yet).
export function usePieceDetail(clientId: string, id: string | null) {
  return useQuery({
    queryKey: pieceKeys.detail(clientId, id ?? "none"),
    queryFn: () => fetchPieceDetail(clientId, id as string),
    enabled: !!id,
  });
}

// Hook: generate content piece via AI
export function useGenerateContent() {
  const generateMutation = useMutation({
    mutationFn: generateContent,
    onSuccess: () => {
      toast.success("Content generated!");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    },
  });

  return {
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
  };
}

// Hook: update a content piece's status
export function useUpdatePieceStatus() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updatePieceStatus,
    onSuccess: (_, variables) => {
      toast.success(
        `Content ${variables.status === "approved" ? "approved" : "archived"}`
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: pieceKeys.byClient(variables.client_id),
      });
    },
  });

  return {
    updateStatus: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}
