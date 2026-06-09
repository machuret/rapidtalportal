"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DailyLog, DailyLogNote, Mood } from "@/types/daily-log";

const DAILY_LOG_KEY = "daily-log";

export interface DailyLogDay {
  log: DailyLog | null;
  notes: DailyLogNote[];
}

export interface UpsertDailyLogInput {
  log_date: string;
  [key: string]: string | Mood | null;
}

export interface AddNoteInput {
  log_id: string;
  body: string;
}

export interface FeedbackInput {
  log_id: string;
  feedback: string;
}

// Query Keys
export const dailyLogKeys = {
  all: [DAILY_LOG_KEY] as const,
  byDate: (date: string, userId?: string) =>
    userId
      ? ([DAILY_LOG_KEY, date, userId] as const)
      : ([DAILY_LOG_KEY, date] as const),
};

// Fetch a single day's log + notes (optionally for a specific VA when admin).
async function fetchDailyLog(
  date: string,
  viewingUserId?: string
): Promise<DailyLogDay> {
  const url = viewingUserId
    ? `/daily-log/${date}?user_id=${viewingUserId}`
    : `/daily-log/${date}`;
  const json = await api.get<{ log: DailyLog | null; notes: DailyLogNote[] }>(url);
  return { log: json.log, notes: json.notes ?? [] };
}

// Read a single day's log. `enabled` lets callers skip the initial (today) fetch
// when server-provided initialData already covers it.
export function useDailyLogQuery(
  date: string,
  viewingUserId: string | undefined,
  options?: { initialData?: DailyLogDay; enabled?: boolean }
) {
  return useQuery({
    queryKey: dailyLogKeys.byDate(date, viewingUserId),
    queryFn: () => fetchDailyLog(date, viewingUserId),
    initialData: options?.initialData,
    enabled: options?.enabled ?? true,
  });
}

// These mutations are surfaced with component-specific error toasts, so the
// api-client default error toast is suppressed to avoid double-toasting.
async function upsertDailyLog(input: UpsertDailyLogInput): Promise<DailyLog> {
  return api.post<DailyLog>("/daily-log/upsert", input, { showErrorToast: false });
}

async function addNote(input: AddNoteInput): Promise<DailyLogNote> {
  return api.post<DailyLogNote>("/daily-log/notes", input, { showErrorToast: false });
}

async function deleteNote(id: string): Promise<void> {
  return api.delete(`/daily-log/notes?id=${id}`, undefined, { showErrorToast: false });
}

async function submitFeedback(input: FeedbackInput): Promise<unknown> {
  return api.post("/daily-log/feedback", input, { showErrorToast: false });
}

export function useUpsertDailyLog() {
  return useMutation({ mutationFn: upsertDailyLog });
}

export function useAddDailyLogNote() {
  return useMutation({ mutationFn: addNote });
}

export function useDeleteDailyLogNote() {
  return useMutation({ mutationFn: deleteNote });
}

export function useSubmitDailyLogFeedback() {
  return useMutation({ mutationFn: submitFeedback });
}
