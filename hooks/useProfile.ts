"use client";

import { useMutation } from "@tanstack/react-query";
import { api, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

interface UpdateProfileInput {
  full_name?: string | null;
  phone?: string | null;
  birthday?: string | null;
  avatar_url?: string | null;
  timezone?: string | null;
}

interface ChangePasswordInput {
  new_password: string;
}

// Update profile fields
async function updateProfile(input: UpdateProfileInput): Promise<unknown> {
  return api.patch(ROUTES.profile(), input);
}

// Change password (PUT — not exposed on the `api` helper)
async function changePassword(input: ChangePasswordInput): Promise<unknown> {
  return apiClient(ROUTES.profile(), {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// Hook for profile mutations
export function useProfile() {
  const updateMutation = useMutation({
    mutationFn: updateProfile,
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
  });

  return {
    updateProfile: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    changePassword: passwordMutation.mutateAsync,
    isChangingPassword: passwordMutation.isPending,
  };
}
