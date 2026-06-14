"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type { ContentTopic, ContentType } from "@/types/content";

const TOPICS_KEY = "topics";

interface CreateTopicInput {
  client_id: string;
  title: string;
  description?: string | null;
  content_type: string;
  ai_fit_score?: number | null;
  ai_flagged?: boolean;
  why?: Record<string, unknown> | null;
}

interface UpdateTopicInput {
  client_id: string;
  id: string;
  status?: "pending" | "approved" | "rejected";
  title?: string;
  description?: string | null;
}

interface DeleteTopicInput {
  client_id: string;
  id: string;
}

// Query Keys
export const topicKeys = {
  all: [TOPICS_KEY] as const,
  byClient: (clientId: string) => [TOPICS_KEY, clientId] as const,
};

// Fetch Topics
async function fetchTopics(clientId: string): Promise<ContentTopic[]> {
  return api.get<ContentTopic[]>(`/content/topics?client_id=${clientId}`);
}

// Create Topic
async function createTopic(input: CreateTopicInput): Promise<ContentTopic> {
  return api.post<ContentTopic>("/content/topics", input);
}

// Update Topic
async function updateTopic(input: UpdateTopicInput): Promise<ContentTopic> {
  return api.patch<ContentTopic>("/content/topics", input);
}

// Delete Topic
async function deleteTopic(input: DeleteTopicInput): Promise<void> {
  return api.delete("/content/topics", input);
}

// Generate AI Topic Ideas
async function generateTopicIdeas(
  clientId: string,
  count: number = 8
): Promise<{ topics: Array<{ title: string; description: string; content_type: string; rationale: string; fit?: number | null; ai_flagged?: boolean; why?: Record<string, unknown> | null }> }> {
  return api.post("/content/topics/generate", { client_id: clientId, count });
}

// Hook for topics management
export function useTopics(clientId: string, initialTopics: ContentTopic[] = []) {
  const queryClient = useQueryClient();

  // Query for topics - uses initial data as placeholder, then fetches fresh
  const topicsQuery = useQuery({
    queryKey: topicKeys.byClient(clientId),
    queryFn: () => fetchTopics(clientId),
    initialData: initialTopics,
    placeholderData: initialTopics, // Show initial data while loading
  });

  // Create mutation with optimistic update
  const createMutation = useMutation({
    mutationFn: createTopic,
    onMutate: async (newTopic) => {
      await queryClient.cancelQueries({ queryKey: topicKeys.byClient(clientId) });
      
      const previousTopics = queryClient.getQueryData<ContentTopic[]>(
        topicKeys.byClient(clientId)
      ) || [];
      
      // Optimistic update
      const optimisticTopic: ContentTopic = {
        id: `temp-${Date.now()}`,
        title: newTopic.title,
        description: newTopic.description ?? null,
        content_type: newTopic.content_type as ContentType,
        status: "pending",
        created_at: new Date().toISOString(),
        created_by: null,
      };
      
      queryClient.setQueryData(topicKeys.byClient(clientId), [
        optimisticTopic,
        ...previousTopics,
      ]);
      
      return { previousTopics };
    },
    onError: (err, newTopic, context) => {
      if (context?.previousTopics) {
        queryClient.setQueryData(topicKeys.byClient(clientId), context.previousTopics);
      }
      toast.error(err instanceof Error ? err.message : "Failed to create topic");
    },
    onSuccess: () => {
      toast.success("Topic created successfully");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: topicKeys.byClient(clientId) });
    },
  });

  // Update status mutation with optimistic update
  const updateStatusMutation = useMutation({
    mutationFn: updateTopic,
    onMutate: async (updatedTopic) => {
      await queryClient.cancelQueries({ queryKey: topicKeys.byClient(clientId) });
      
      const previousTopics = queryClient.getQueryData<ContentTopic[]>(
        topicKeys.byClient(clientId)
      ) || [];
      
      // Optimistic update
      const newTopics = previousTopics.map((topic) =>
        topic.id === updatedTopic.id
          ? { ...topic, status: updatedTopic.status }
          : topic
      );
      
      queryClient.setQueryData(topicKeys.byClient(clientId), newTopics);
      
      return { previousTopics };
    },
    onError: (err, variables, context) => {
      if (context?.previousTopics) {
        queryClient.setQueryData(topicKeys.byClient(clientId), context.previousTopics);
      }
      toast.error(err instanceof Error ? err.message : "Failed to update topic");
    },
    onSuccess: (_, variables) => {
      const action = variables.status === "approved" ? "approved" : "rejected";
      toast.success(`Topic ${action}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: topicKeys.byClient(clientId) });
    },
  });

  // Delete mutation with optimistic update
  const deleteMutation = useMutation({
    mutationFn: deleteTopic,
    onMutate: async (deletedTopic) => {
      await queryClient.cancelQueries({ queryKey: topicKeys.byClient(clientId) });
      
      const previousTopics = queryClient.getQueryData<ContentTopic[]>(
        topicKeys.byClient(clientId)
      ) || [];
      
      // Optimistic update
      const newTopics = previousTopics.filter((topic) => topic.id !== deletedTopic.id);
      
      queryClient.setQueryData(topicKeys.byClient(clientId), newTopics);
      
      return { previousTopics };
    },
    onError: (err, variables, context) => {
      if (context?.previousTopics) {
        queryClient.setQueryData(topicKeys.byClient(clientId), context.previousTopics);
      }
      toast.error(err instanceof Error ? err.message : "Failed to delete topic");
    },
    onSuccess: () => {
      toast.success("Topic deleted");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: topicKeys.byClient(clientId) });
    },
  });

  // AI generation mutation
  const generateIdeasMutation = useMutation({
    mutationFn: ({ count }: { count: number }) => generateTopicIdeas(clientId, count),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to generate ideas");
    },
  });

  return {
    // Data
    topics: topicsQuery.data || initialTopics,
    isLoading: topicsQuery.isLoading,
    isRefetching: topicsQuery.isRefetching,
    
    // Mutations
    createTopic: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdating: updateStatusMutation.isPending,
    
    deleteTopic: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    
    generateIdeas: generateIdeasMutation.mutateAsync,
    isGenerating: generateIdeasMutation.isPending,
    suggestions: generateIdeasMutation.data?.topics || null,
    
    // Utilities
    refetch: topicsQuery.refetch,
  };
}
