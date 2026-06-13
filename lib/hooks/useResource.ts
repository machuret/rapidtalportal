"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/**
 * Generic React-Query collection for a CRUD admin resource — generalises the
 * useUsers pattern so the hand-rolled `useState` + manual-optimistic components
 * (leads, expenses, …) all share one tested data layer. SSR-seeded via
 * `initial`; create prepends, update merges optimistically then replaces with
 * the server row, remove drops optimistically. Error toasts are owned by the
 * api client (rollback only here — no double toast); callers keep their own
 * success toasts.
 */
export interface HasId { id: string }

export function useResource<T extends HasId>(opts: {
  key: readonly unknown[];
  route: string;
  initial: T[];
}) {
  const qc = useQueryClient();
  const { key, route, initial } = opts;

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<T[]>(route),
    initialData: initial,
    placeholderData: initial,
  });

  const setList = (fn: (prev: T[]) => T[]) =>
    qc.setQueryData<T[]>(key, (prev) => fn(prev ?? []));
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const createM = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<T>(route, body),
    onSuccess: (row) => setList((p) => [row, ...p]),
    onSettled: invalidate,
  });

  const updateM = useMutation({
    mutationFn: (body: { id: string } & Record<string, unknown>) => api.patch<T>(route, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<T[]>(key) ?? [];
      // Optimistic merge — same-named fields (e.g. a kanban stage move) update
      // instantly; the server row replaces everything onSuccess.
      setList((p) => p.map((x) => (x.id === body.id ? { ...x, ...body } as T : x)));
      return { prev };
    },
    onSuccess: (row) => setList((p) => p.map((x) => (x.id === row.id ? row : x))),
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: invalidate,
  });

  const removeM = useMutation({
    mutationFn: (body: { id: string } & Record<string, unknown>) => api.delete(route, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<T[]>(key) ?? [];
      setList((p) => p.filter((x) => x.id !== body.id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: invalidate,
  });

  return {
    items: query.data ?? initial,
    isLoading: query.isLoading,
    create: createM.mutateAsync,
    update: updateM.mutateAsync,
    remove: removeM.mutateAsync,
    isMutating: createM.isPending || updateM.isPending || removeM.isPending,
  };
}
