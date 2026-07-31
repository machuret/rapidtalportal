"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type {
  ContentBrief,
  ContentPiece,
  ContentSourceReference,
  ContentStatus,
  ContentType,
} from "@/types/content";
import type { EditorialLearningSuggestion } from "@/components/content/EditorialLearningPrompt";

const PIECES_KEY = "content-pieces";

/* ── Full piece with body (returned by detail endpoint) ─────────── */
export interface ContentPieceFull extends ContentPiece {
  brief?: string | null;
  body: string | null;
  updated_at?: string;
  learning_suggestion?: EditorialLearningSuggestion | null;
  editorial_warning?: string | null;
}

interface GenerationResponse {
  id: string;
  updatedAt?: string | null;
  body: string;
  critique?: { issues: string[]; grounded: boolean };
  appliedStyle?: string[];
  styleSnapshot?: ContentPiece["style_snapshot"];
  sources?: ContentSourceReference[];
  warnings?: string[];
}

interface GenerateContentInput {
  clientId: string;
  contentType: ContentType;
  title: string;
  brief: ContentBrief;
  projectId?: string;
  vaultSourceIds?: string[];
}

interface UpdatePieceStatusInput {
  client_id: string;
  id: string;
  status: ContentStatus;
  expected_updated_at?: string;
}

interface UpdateContentPieceInput {
  client_id: string;
  id: string;
  title?: string;
  body?: string | null;
  expected_updated_at?: string;
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
): Promise<ContentPieceFull> {
  return api.patch<ContentPieceFull>("/api/content/pieces", input);
}

async function updateContentPiece(input: UpdateContentPieceInput): Promise<ContentPieceFull> {
  return api.patch<ContentPieceFull>("/api/content/pieces", input);
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
    onSuccess: (piece, variables) => {
      queryClient.setQueryData(pieceKeys.detail(variables.client_id, variables.id), piece);
      toast.success(
        variables.status === "approved"
          ? "Content approved"
          : variables.status === "archived"
            ? "Content archived"
            : "Content restored to draft"
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

export function useUpdateContentPiece() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: updateContentPiece,
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    },
    onSuccess: (piece, variables) => {
      queryClient.setQueryData(pieceKeys.detail(variables.client_id, variables.id), piece);
      queryClient.invalidateQueries({ queryKey: pieceKeys.byClient(variables.client_id) });
    },
  });
  return {
    updatePiece: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}
