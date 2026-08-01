"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import type { CrmContact } from "@/app/(portal)/crm/page";

const CONTACTS_KEY = "contacts";
const NOTES_KEY = "crm-notes";

export type CrmNote = { id: string; body: string; created_at: string };

// Query Keys
interface CreateContactInput {
  clientId: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  status: string;
  source: string | null;
  notes: string | null;
}

interface UpdateContactInput {
  id: string;
  clientId: string;
  first_name?: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  status?: string;
  source?: string | null;
  notes?: string | null;
  archived?: boolean;
}

interface DeleteContactInput {
  id: string;
  clientId: string;
}

interface CreateNoteInput {
  contactId: string;
  clientId: string;
  body: string;
}

interface DeleteNoteInput {
  id: string;
  clientId: string;
}

function createContact(input: CreateContactInput): Promise<CrmContact> {
  return api.post<CrmContact>(ROUTES.crm.contacts(), input);
}

function updateContact(input: UpdateContactInput): Promise<CrmContact> {
  return api.patch<CrmContact>(ROUTES.crm.contacts(), input);
}

function deleteContact(input: DeleteContactInput): Promise<{ ok: true }> {
  return api.delete<{ ok: true }>(ROUTES.crm.contacts(), input);
}

function createNote(input: CreateNoteInput): Promise<CrmNote> {
  return api.post<CrmNote>(ROUTES.crm.notes(), input);
}

function deleteNote(input: DeleteNoteInput): Promise<{ ok: true }> {
  return api.delete<{ ok: true }>(ROUTES.crm.notes(), input);
}

// Create contact (used by the Add Contact form)
export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onSettled: (_data, _err, variables) => {
    },
  });
}

// Contact + note mutations for the detail panel.
export function useContactMutations(clientId: string) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: updateContact,
    onSettled: () => {
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onSettled: () => {
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: createNote,
    onSettled: (_data, _err, variables) => {
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: deleteNote,
  });

  return {
    updateContact: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    deleteContact: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,

    createNote: createNoteMutation.mutateAsync,
    isCreatingNote: createNoteMutation.isPending,

    deleteNote: deleteNoteMutation.mutateAsync,
  };
}
