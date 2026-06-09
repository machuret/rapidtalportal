"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

const KB_KEY = "kb-entries";

// Query Keys
export const kbKeys = {
  all: [KB_KEY] as const,
  byClient: (clientId: string) => [KB_KEY, clientId] as const,
};

interface GenerateInput {
  clientId: string;
  customCategories: string[];
}

interface UpdateEntryInput {
  id: string;
  clientId: string;
  question: string;
  answer: string;
  category: string;
}

interface DeleteEntryInput {
  id: string;
  clientId: string;
}

function generateKb(input: GenerateInput): Promise<{ count: number }> {
  const { clientId, customCategories } = input;
  return api.post<{ count: number }>(ROUTES.kb.generate(), { clientId, customCategories });
}

function updateEntry(input: UpdateEntryInput): Promise<{ success: true }> {
  const { id, clientId, question, answer, category } = input;
  return api.patch<{ success: true }>(ROUTES.kb.entry(id), { clientId, question, answer, category });
}

function deleteEntry(input: DeleteEntryInput): Promise<{ success: true }> {
  const { id, clientId } = input;
  return api.delete<{ success: true }>(ROUTES.kb.entry(id), { clientId });
}

export function useKb(clientId: string) {
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: generateKb,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.byClient(clientId) });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: updateEntry,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.byClient(clientId) });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: deleteEntry,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.byClient(clientId) });
    },
  });

  return {
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,

    updateEntry: updateEntryMutation.mutateAsync,

    deleteEntry: deleteEntryMutation.mutateAsync,
  };
}
