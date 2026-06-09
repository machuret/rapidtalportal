"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

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
  return api.patch<ClientInfo>(ROUTES.admin.client(id), body);
}

// Hook: update client details
export function useUpdateClient() {
  return useMutation({
    mutationFn: updateClient,
  });
}
