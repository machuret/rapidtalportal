"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { Sop } from "@/types/sops";

const SOPS_KEY = "sops";

interface SopStepInput { title: string; detail: string; tip?: string }

interface CreateSopInput {
  clientId: string | null; // null = global library SOP
  title: string;
  category: string;
  subcategory?: string | null;
  body: string;
  order_index: number;
  steps?: SopStepInput[];
  intro?: string;
  prerequisites?: string[];
  visibility?: "public" | "restricted";
  accessUserIds?: string[];
}

interface UpdateSopInput {
  id: string;
  clientId: string | null;
  title?: string;
  category?: string;
  subcategory?: string | null;
  body?: string;
  steps?: SopStepInput[];
  intro?: string;
  prerequisites?: string[];
  visibility?: "public" | "restricted";
  accessUserIds?: string[];
}

interface DeleteSopInput {
  id: string;
  clientId: string | null;
}

// Query Keys
// Create SOP
async function createSop(input: CreateSopInput): Promise<Sop> {
  return api.post<Sop>(ROUTES.sops(), input);
}

// Update SOP
async function updateSop(input: UpdateSopInput): Promise<Sop> {
  return api.patch<Sop>(ROUTES.sops(), input);
}

// Delete SOP
async function deleteSop(input: DeleteSopInput): Promise<void> {
  return api.delete(ROUTES.sops(), input);
}

// Hook for SOP mutations
export function useSops(clientId: string | null) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createSop,
    onSettled: () => {
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateSop,
    onSettled: () => {
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSop,
    onSettled: () => {
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
