/**
 * Brain Journal — append human-readable activity so the Brain feels alive.
 * Best-effort: a logging failure must never break the action that triggered it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export type BrainEventKind = "learned" | "filtered" | "read" | "level_up" | "briefing" | "feedback";

export async function logBrainEvent(
  admin: Admin,
  clientId: string,
  kind: BrainEventKind,
  summary: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await admin.from("brain_events").insert({ client_id: clientId, kind, summary, meta });
  } catch (e) {
    console.error("[brain/events] insert failed", e);
  }
}
