"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

export interface Message {
  id: string;
  client_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  audience: "company" | "client" | "va_team";
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
  audience?: "company" | "client" | "va_team";
}

// Fetch via the server API (admin client, scoped in code) rather than the
// browser client's RLS query — the latter was failing on /messages.
async function fetchMessages(clientId: string): Promise<Message[]> {
  const { messages } = await api.get<{ messages: Message[] }>(
    ROUTES.messages.list(clientId),
    { showErrorToast: false },
  );
  return messages ?? [];
}

// Send message via API
async function sendMessage(input: SendMessageInput): Promise<unknown> {
  return api.post(ROUTES.messages.send(), input);
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
