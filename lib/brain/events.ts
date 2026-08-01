/**
 * Brain Journal — append human-readable activity so the Brain feels alive.
 * Best-effort: a logging failure must never break the action that triggered it.
 *
 * Two paths: plain inserts (legacy, `meaningful=false`, hidden from /brain),
 * and meaningful events via the record_meaningful_brain_event RPC — the same
 * one DB triggers use — which renders on /brain and upserts on
 * (client_id, event_key) so recurring events update one row instead of
 * flooding the journal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient;

export type BrainEventKind = "learned" | "filtered" | "read" | "level_up" | "briefing" | "feedback";

export type BrainEventOptions = {
  /** Show on /brain (the page filters meaningful=true). */
  meaningful?: boolean;
  /** Dedupe key — repeated events with the same key update one row. */
  eventKey?: string;
  channel?: string;
  artifactId?: string;
};

export async function logBrainEvent(
  admin: Admin,
  clientId: string,
  kind: BrainEventKind,
  summary: string,
  meta: Record<string, unknown> = {},
  opts: BrainEventOptions = {},
): Promise<void> {
  try {
    if (opts.meaningful) {
      await admin.rpc("record_meaningful_brain_event", {
        p_client_id: clientId,
        p_event_type: kind,
        p_summary: summary,
        p_meta: meta,
        p_channel: opts.channel ?? null,
        p_artifact_id: opts.artifactId ?? null,
        p_event_key: opts.eventKey ?? null,
      });
      return;
    }
    await admin.from("brain_events").insert({ client_id: clientId, kind, summary, meta });
  } catch (e) {
    console.error("[brain/events] insert failed", e);
  }
}
