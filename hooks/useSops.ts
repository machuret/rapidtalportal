"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type { Sop } from "@/app/(portal)/sops/page";

const SOPS_KEY = "sops";

interface CreateSopInput {
  clientId: string;
  title: string;
  category: string;
  body: string;
  order_index: number;
}

interface UpdateSopInput {
  id: string;
  clientId: string;
  title: string;
  category: string;
  body: string;
}

interface DeleteSopInput {
  id: string;
  clientId: string;
}

// Query Keys
export const sopKeys = {
  all: [SOPS_KEY] as const,
  byClient: (clientId: string) => [SOPS_KEY, clientId] as const,
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
export function useSops(clientId: string) {
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
