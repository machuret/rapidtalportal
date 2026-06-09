"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";

export interface Message {
  id: string;
  client_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  read_by: string[];
  created_at: string;
}

const MESSAGES_KEY = "messages";

// Query Keys
export const messageKeys = {
  all: [MESSAGES_KEY] as const,
  byClient: (clientId: string) => [MESSAGES_KEY, clientId] as const,
};

interface SendMessageInput {
  message: string;
}

// Fetch messages directly from Supabase
async function fetchMessages(clientId: string): Promise<Message[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Failed to load messages.");
  return (data as Message[]) ?? [];
}

// Send message via API
async function sendMessage(input: SendMessageInput): Promise<unknown> {
  return api.post("/messages/send", input);
}

interface UseMessagesOptions {
  initialMessages?: Message[];
  /** When set, the query refetches on this interval (ms) to poll for new messages. */
  refetchInterval?: number;
}

// Hook for messages
export function useMessages(clientId: string, options: UseMessagesOptions = {}) {
  const { initialMessages, refetchInterval } = options;
  const queryClient = useQueryClient();

  const messagesQuery = useQuery({
    queryKey: messageKeys.byClient(clientId),
    queryFn: () => fetchMessages(clientId),
    initialData: initialMessages,
    placeholderData: initialMessages,
    refetchInterval,
  });

  const sendMutation = useMutation({
    mutationFn: sendMessage,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.byClient(clientId) });
    },
  });

  // Append a message into the query cache (used by realtime inserts), de-duped by id.
  function appendMessage(message: Message) {
    queryClient.setQueryData<Message[]>(messageKeys.byClient(clientId), (prev) => {
      const list = prev ?? [];
      if (list.some((m) => m.id === message.id)) return list;
      return [...list, message];
    });
  }

  return {
    messages: messagesQuery.data ?? [],
    isLoading: messagesQuery.isLoading,
    isError: messagesQuery.isError,

    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,

    appendMessage,
    refetch: messagesQuery.refetch,
  };
}
