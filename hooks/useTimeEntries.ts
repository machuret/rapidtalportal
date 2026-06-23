"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

const TIME_ENTRIES_KEY = "time-entries";

// Raw segment as returned by GET /api/time-entries
export interface TimeEntryRow {
  id: string;
  user_id?: string;
  client_id?: string;
  work_date?: string;
  phase: "work" | "break";
  started_at: string;
  ended_at: string | null;
  is_manual?: boolean;
  notes?: string | null;
  category?: string;
}

export interface UpsertTimeEntryInput {
  id?: string;
  work_date: string;
  phase: "work" | "break";
  started_at: string;
  ended_at?: string | null;
  is_manual?: boolean;
  notes?: string | null;
  category?: string;
}

// Query Keys
export const timeEntryKeys = {
  all: [TIME_ENTRIES_KEY] as const,
  byDate: (date: string) => [TIME_ENTRIES_KEY, date] as const,
};

async function fetchTimeEntries(date: string): Promise<TimeEntryRow[]> {
  const json = await api.get<{ entries: TimeEntryRow[] }>(
    `/time-entries?date=${date}`,
    { showErrorToast: false, retries: 1 }
  );
  return json.entries ?? [];
}

async function upsertTimeEntry(
  input: UpsertTimeEntryInput
): Promise<{ entry?: { id: string } }> {
  return api.post<{ entry?: { id: string } }>("/time-entries", input);
}

// Query for a given day's time entries.
export function useTimeEntriesQuery(date: string, enabled: boolean = true) {
  return useQuery({
    queryKey: timeEntryKeys.byDate(date),
    queryFn: () => fetchTimeEntries(date),
    enabled,
  });
}

// Mutation for upserting (inserting/closing) a single segment.
export function useUpsertTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertTimeEntry,
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: timeEntryKeys.byDate(variables.work_date),
      });
    },
  });
}

// Mutation for deleting a single segment a VA flagged as wrong.
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; work_date: string }) =>
      api.delete(`/time-entries?id=${input.id}`, undefined, { showErrorToast: false }),
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: timeEntryKeys.byDate(variables.work_date),
      });
    },
  });
}
