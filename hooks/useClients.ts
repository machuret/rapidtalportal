"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ClientInfo {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface UpdateClientInput {
  id: string;
  name: string;
  slug: string;
}

// Update a client's name / slug
async function updateClient({
  id,
  ...body
}: UpdateClientInput): Promise<ClientInfo> {
  return api.patch<ClientInfo>(`/api/admin/clients/${id}`, body);
}

// Hook: update client details
export function useUpdateClient() {
  return useMutation({
    mutationFn: updateClient,
  });
}
