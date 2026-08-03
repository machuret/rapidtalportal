import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLIENT_ONBOARDING_MILESTONES,
  type ClientFirstSuccessProgress,
  type ClientOnboardingMilestone,
} from "@/lib/onboarding/client-first-success";

function isMilestone(value: unknown): value is ClientOnboardingMilestone {
  return typeof value === "string" && (CLIENT_ONBOARDING_MILESTONES as readonly string[]).includes(value);
}

export async function loadClientFirstSuccessProgress(clientId: string): Promise<ClientFirstSuccessProgress> {
  const admin = createAdminClient();
  // The generated schema is updated after the migration is applied. Keeping the
  // cast local preserves typed application code while allowing atomic rollout.
  const { data, error } = await (admin as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("get_client_first_success_progress", { p_client_id: clientId });
  if (error) throw new Error(error.message);
  const value = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const milestones = Array.isArray(value.milestones)
    ? value.milestones.filter(isMilestone)
    : [];
  const rawCount = typeof value.readyDocumentCount === "number"
    ? value.readyDocumentCount
    : Number(value.readyDocumentCount ?? 0);
  return {
    milestones,
    readyDocumentCount: Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0,
  };
}

export async function recordClientOnboardingMilestone(input: {
  clientId: string;
  milestone: ClientOnboardingMilestone;
  completedBy: string | null;
  sourceType: "company_dna" | "style" | "vault" | "coach" | "content" | "task" | "system";
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await (admin as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("record_client_onboarding_milestone", {
    p_client_id: input.clientId,
    p_milestone: input.milestone,
    p_completed_by: input.completedBy,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}
