/**
 * Live staging concurrency acceptance test for migration 139.
 *
 * Requires a disposable existing Coach turn/snapshot plus a service key:
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * COACH_CONCURRENCY_CLIENT_ID, COACH_CONCURRENCY_OWNER_ID,
 * COACH_CONCURRENCY_TURN_ID, COACH_CONCURRENCY_SNAPSHOT_ID
 *
 * The suite creates a unique preview, confirms it twice concurrently, proves
 * exactly-once execution, and removes every record it created.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  COACH_CONCURRENCY_CLIENT_ID: CLIENT_ID,
  COACH_CONCURRENCY_OWNER_ID: OWNER_ID,
  COACH_CONCURRENCY_TURN_ID: TURN_ID,
  COACH_CONCURRENCY_SNAPSHOT_ID: SNAPSHOT_ID,
} = process.env;
const ready = Boolean(URL && SERVICE_KEY && CLIENT_ID && OWNER_ID && TURN_ID && SNAPSHOT_ID);
const live = ready ? describe : describe.skip;

live("Coach progress live concurrency", () => {
  const admin = ready ? createClient(URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : null;

  it("executes two simultaneous confirmations exactly once", async () => {
    const idempotencyKey = randomUUID();
    const marker = `Concurrency acceptance ${idempotencyKey}`;
    const action = {
      type: "create_goal", idempotencyKey, title: marker,
      outcome: "Exactly one private goal is created.", targetDate: null,
    };
    const originalTurn = await admin!.from("coach_turns")
      .select("action_status,action_completed_at").eq("id", TURN_ID!).single();
    expect(originalTurn.error).toBeNull();
    const preview = await admin!.from("coach_action_previews").insert({
      idempotency_key: idempotencyKey, brain_context_snapshot_id: SNAPSHOT_ID,
      client_id: CLIENT_ID, owner_id: OWNER_ID, action_type: "create_goal",
      generated_payload: action, status: "draft",
    });
    expect(preview.error).toBeNull();

    let goalId: string | null = null;
    try {
      const args = {
        p_idempotency_key: idempotencyKey, p_turn_id: TURN_ID,
        p_client_id: CLIENT_ID, p_owner_id: OWNER_ID,
        p_snapshot_id: SNAPSHOT_ID, p_action: action,
      };
      const [first, second] = await Promise.all([
        admin!.rpc("execute_coach_progress_action", args),
        admin!.rpc("execute_coach_progress_action", args),
      ]);
      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      const outcomes = [first.data, second.data] as Array<{ ok: boolean; replayed: boolean; result: { id: string } }>;
      expect(outcomes.every((result) => result.ok)).toBe(true);
      expect(outcomes.filter((result) => result.replayed)).toHaveLength(1);
      expect(new Set(outcomes.map((result) => result.result.id)).size).toBe(1);
      goalId = outcomes[0].result.id;
      const rows = await admin!.from("coach_goals").select("id").eq("title", marker);
      expect(rows.error).toBeNull();
      expect(rows.data).toHaveLength(1);
    } finally {
      if (goalId) await admin!.from("coach_goals").delete().eq("id", goalId);
      await admin!.from("coach_action_receipts").delete().eq("idempotency_key", idempotencyKey);
      await admin!.from("coach_action_previews").delete().eq("idempotency_key", idempotencyKey);
      await admin!.from("coach_turns").update({
        action_status: originalTurn.data?.action_status ?? "none",
        action_completed_at: originalTurn.data?.action_completed_at ?? null,
      }).eq("id", TURN_ID!);
    }
  });
});
