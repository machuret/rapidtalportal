"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { toast } from "sonner";
import type { UserRole } from "@/types/database";

const USERS_KEY = "admin-users";

/* ── Shared row shape ───────────────────────────────────────────── */
export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  client_id: string | null;
  created_at: string;
}

// User row scoped to a single client (no client_id field exposed)
export interface ClientUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

interface CreateUserInput {
  email: string;
  full_name: string;
  role: UserRole;
  client_id: string | null;
  password?: string;
}

interface UpdateUserInput {
  id: string;
  email?: string;
  full_name?: string | null;
  role?: UserRole;
  client_id?: string | null;
}

interface DeleteUserInput {
  id: string;
}

// Query Keys
export const userKeys = {
  all: [USERS_KEY] as const,
  list: () => [USERS_KEY, "list"] as const,
  byClient: (clientId: string) => [USERS_KEY, "client", clientId] as const,
};

// Create user
function createUser<T>(input: CreateUserInput): Promise<T> {
  return api.post<T>(ROUTES.admin.users(), input);
}

// Update user
function updateUser<T>(input: UpdateUserInput): Promise<T> {
  return api.patch<T>(ROUTES.admin.users(), input);
}

// Delete user
function deleteUser(input: DeleteUserInput): Promise<void> {
  return api.delete(ROUTES.admin.users(), input);
}

/**
 * Global users list (admin /users page). Seeded by server `initialUsers`.
 * Handles create / update / quick edits / delete with optimistic updates.
 */
export function useUsers(initialUsers: AdminUserRow[]) {
  const queryClient = useQueryClient();
  const key = userKeys.list();

  const usersQuery = useQuery({
    queryKey: key,
    queryFn: () => api.get<AdminUserRow[]>(ROUTES.admin.users()),
    initialData: initialUsers,
    placeholderData: initialUsers,
  });

  // Create — prepend to list
  const createMutation = useMutation({
    mutationFn: createUser<AdminUserRow>,
    onSuccess: (user) => {
      queryClient.setQueryData<AdminUserRow[]>(key, (prev) => [
        user,
        ...(prev ?? []),
      ]);
      toast.success(`User "${user.full_name}" created`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  // Full update (inline edit) — replaces row with server response
  const updateMutation = useMutation({
    mutationFn: updateUser<AdminUserRow>,
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminUserRow[]>(key, (prev) =>
        (prev ?? []).map((u) => (u.id === updated.id ? updated : u))
      );
      toast.success("User updated");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  // Quick patch (role / client) — optimistic local mutation
  const quickUpdateMutation = useMutation({
    mutationFn: ({
      input,
    }: {
      input: UpdateUserInput;
      successMessage: string;
    }) => updateUser<AdminUserRow>(input),
    onMutate: async ({ input }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previousUsers = queryClient.getQueryData<AdminUserRow[]>(key) ?? [];
      queryClient.setQueryData<AdminUserRow[]>(key, (prev) =>
        (prev ?? []).map((u) =>
          u.id === input.id ? { ...u, ...input } : u
        )
      );
      return { previousUsers };
    },
    onSuccess: (_, { successMessage }) => {
      toast.success(successMessage);
    },
    onError: (err, _vars, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(key, context.previousUsers);
      }
      toast.error(err instanceof Error ? err.message : "Failed to update");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  // Delete — optimistic removal
  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previousUsers = queryClient.getQueryData<AdminUserRow[]>(key) ?? [];
      queryClient.setQueryData<AdminUserRow[]>(key, (prev) =>
        (prev ?? []).filter((u) => u.id !== input.id)
      );
      return { previousUsers };
    },
    onSuccess: () => {
      toast.success("User deleted");
    },
    onError: (err, _vars, context) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(key, context.previousUsers);
      }
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return {
    users: usersQuery.data ?? initialUsers,
    isLoading: usersQuery.isLoading,

    createUser: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    updateUser: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    quickUpdateUser: quickUpdateMutation.mutateAsync,

    deleteUser: deleteMutation.mutateAsync,
  };
}

/* ── Bare mutation factories for the client-detail page ─────────── */

export function useCreateClientUser() {
  return useMutation({
    mutationFn: createUser<ClientUserRow>,
  });
}

export function useUpdateClientUser() {
  return useMutation({
    mutationFn: updateUser<ClientUserRow>,
  });
}

export function useDeleteClientUser() {
  return useMutation({
    mutationFn: deleteUser,
  });
}
