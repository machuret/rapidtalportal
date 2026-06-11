"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Sop } from "@/app/(portal)/sops/page";

const SOPS_KEY = "sops";

interface SopStepInput { title: string; detail: string; tip?: string }

interface CreateSopInput {
  clientId: string | null; // null = global library SOP
  title: string;
  category: string;
  body: string;
  order_index: number;
  steps?: SopStepInput[];
  intro?: string;
  prerequisites?: string[];
}

interface UpdateSopInput {
  id: string;
  clientId: string | null;
  title?: string;
  category?: string;
  body?: string;
  steps?: SopStepInput[];
  intro?: string;
  prerequisites?: string[];
}

interface DeleteSopInput {
  id: string;
  clientId: string | null;
}

// Query Keys
export const sopKeys = {
  all: [SOPS_KEY] as const,
  byClient: (clientId: string | null) => [SOPS_KEY, clientId ?? "global"] as const,
};

// Create SOP
async function createSop(input: CreateSopInput): Promise<Sop> {
  return api.post<Sop>("/sops", input);
}

// Update SOP
async function updateSop(input: UpdateSopInput): Promise<Sop> {
  return api.patch<Sop>("/sops", input);
}

// Delete SOP
async function deleteSop(input: DeleteSopInput): Promise<void> {
  return api.delete("/sops", input);
}

// Hook for SOP mutations
export function useSops(clientId: string | null) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createSop,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sopKeys.byClient(clientId) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateSop,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sopKeys.byClient(clientId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSop,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sopKeys.byClient(clientId) });
    },
  });

  return {
    createSop: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    updateSop: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    deleteSop: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
