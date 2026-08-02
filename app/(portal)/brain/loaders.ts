import type { createAdminClient } from "@/lib/supabase/admin";
import type { BrainMemoryItem } from "@/components/brain/BrainMemoryPanel";

/**
 * Shared server loaders for the /brain/* sub-pages (Analytics + Learning both
 * need the super-admin client picker and the same feedback/signals windows).
 * Narrow selects only — these rows are counted/grouped, never rendered whole.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export interface BrainPickerState {
  clientId: string | null;
  clientOptions: { id: string; name: string }[];
  selectedClientName: string | null;
}

/** A super-admin normally has no client_id — let them pick a Brain instead of
 *  hitting a redirect wall (the same pattern /brain uses). */
export async function resolveBrainPicker(
  admin: AdminClient,
  user: { role: string; client_id: string | null },
  searchClient: string | undefined,
): Promise<BrainPickerState> {
  if (user.role !== "super_admin") {
    return { clientId: user.client_id, clientOptions: [], selectedClientName: null };
  }
  const { data: clients } = await admin
    .from("clients").select("id, name").is("archived_at", null).order("name");
  const clientOptions = (clients ?? []) as { id: string; name: string }[];
  const selected = clientOptions.find((option) => option.id === searchClient) ?? clientOptions[0];
  return {
    clientId: selected?.id ?? null,
    clientOptions,
    selectedClientName: selected?.name ?? null,
  };
}

export interface BrainFeedbackRow {
  id: string;
  question: string;
  answer: string;
  rating: number;
  resolved: boolean;
  sources: { kind: string; title: string }[];
}

export async function loadVaultFeedback(
  admin: AdminClient,
  clientId: string,
  since: string,
): Promise<BrainFeedbackRow[]> {
  const res = await admin
    .from("vault_feedback")
    .select("id, question, answer, rating, resolved, sources, created_at")
    .eq("client_id", clientId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  return ((res.error ? [] : (res.data ?? [])) as {
    id: string; question: string; answer: string; rating: number;
    sources: unknown; resolved: boolean; created_at: string | null;
  }[]).map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    rating: row.rating,
    resolved: row.resolved,
    sources: (Array.isArray(row.sources) ? row.sources : []) as { kind: string; title: string }[],
  }));
}

export interface BrainSignalRow {
  rating: number;
  surface: string;
  visibility: "private_coach" | "team_learning";
  distilled_at: string | null;
}

export async function loadBrainSignals(
  admin: AdminClient,
  clientId: string,
  since: string,
): Promise<BrainSignalRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (admin as any).from("brain_signals")
    .select("rating, surface, visibility, created_at, distilled_at")
    .eq("client_id", clientId)
    .gte("created_at", since)
    .limit(3000);
  return (res.error ? [] : (res.data ?? [])) as BrainSignalRow[];
}

export async function loadBrainMemory(
  admin: AdminClient,
  clientId: string,
): Promise<BrainMemoryItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (admin as any).from("brain_memory")
    .select("id,kind,content,confidence,source_count,active,pinned,status,scope,created_at,first_observed_at,last_confirmed_at,approved_at,contradiction_status,conflict_summary,lineage_complete")
    .eq("client_id", clientId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return (res.error ? [] : (res.data ?? [])) as BrainMemoryItem[];
}
