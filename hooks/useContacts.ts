"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CrmContact } from "@/app/(portal)/crm/page";

const CONTACTS_KEY = "contacts";
const NOTES_KEY = "crm-notes";

export type CrmNote = { id: string; body: string; created_at: string };

// Query Keys
export const contactKeys = {
  all: [CONTACTS_KEY] as const,
  byClient: (clientId: string) => [CONTACTS_KEY, clientId] as const,
};

export const noteKeys = {
  all: [NOTES_KEY] as const,
  byContact: (contactId: string) => [NOTES_KEY, contactId] as const,
};

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
  return api.post<CrmContact>("/crm/contacts", input);
}

function updateContact(input: UpdateContactInput): Promise<CrmContact> {
  return api.patch<CrmContact>("/crm/contacts", input);
}

function deleteContact(input: DeleteContactInput): Promise<{ ok: true }> {
  return api.delete<{ ok: true }>("/crm/contacts", input);
}

function createNote(input: CreateNoteInput): Promise<CrmNote> {
  return api.post<CrmNote>("/crm/notes", input);
}

function deleteNote(input: DeleteNoteInput): Promise<{ ok: true }> {
  return api.delete<{ ok: true }>("/crm/notes", input);
}

// Create contact (used by the Add Contact form)
export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.byClient(variables.clientId) });
    },
  });
}

// Contact + note mutations for the detail panel.
export function useContactMutations(clientId: string) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: updateContact,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.byClient(clientId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.byClient(clientId) });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: createNote,
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.byContact(variables.contactId) });
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
