"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DbCompanyDna } from "@/types/database";

interface SaveDnaInput {
  form: Partial<DbCompanyDna>;
  clientId: string;
}

interface ScrapeInput {
  url: string;
  clientId: string;
}

interface ScrapeResult {
  data: Partial<DbCompanyDna> & { updated_at?: string | null };
  tokensUsed?: number;
}

function saveDna(input: SaveDnaInput): Promise<DbCompanyDna> {
  const { form, clientId } = input;
  // Component shows its own toast messages, so suppress the default error toast.
  return api.post<DbCompanyDna>("/company-dna", { ...form, client_id: clientId }, { showErrorToast: false });
}

function scrapeDna(input: ScrapeInput): Promise<ScrapeResult> {
  const { url, clientId } = input;
  // Component shows its own toast messages, so suppress the default error toast.
  return api.post<ScrapeResult>("/company-dna/scrape", { url, clientId }, { showErrorToast: false });
}

export function useDna() {
  const saveMutation = useMutation({ mutationFn: saveDna });
  const scrapeMutation = useMutation({ mutationFn: scrapeDna });

  return {
    saveDna: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,

    scrapeDna: scrapeMutation.mutateAsync,
    isScraping: scrapeMutation.isPending,
  };
}
