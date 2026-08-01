import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coachActionDenial } from "@/lib/brain/coach-action-policy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Coach action integrity", () => {
  test.each([
    ["va", { type: "update_task", status: "todo" }, null],
    ["va", { type: "update_task", status: "in_progress" }, null],
    ["va", { type: "update_task", status: "review" }, "va_terminal_status_forbidden"],
    ["va", { type: "update_task", status: "done" }, "va_terminal_status_forbidden"],
    ["va", { type: "submit_review" }, null],
    ["va", { type: "review_task" }, "client_review_only"],
    ["client_admin", { type: "review_task" }, null],
    ["client_admin", { type: "submit_review" }, "va_submit_only"],
    ["va", { type: "send_message", audience: "client" }, null],
    ["va", { type: "send_message", audience: "va_team" }, "message_audience_forbidden"],
    ["client_admin", { type: "send_message", audience: "va_team" }, null],
    ["client_admin", { type: "send_message", audience: "client" }, "message_audience_forbidden"],
    ["client_admin", { type: "create_goal" }, null],
    ["va", { type: "create_commitment" }, null],
    ["super_admin", { type: "create_goal" }, "coaching_progress_forbidden"],
  ] as const)("authorizes %s %#", (role, action, expected) => {
    expect(coachActionDenial(role, action)).toBe(expected);
  });

  it("uses server-authored previews and one transactional executor", () => {
    const migration = read("db/migrations/137_coach_action_integrity.sql");
    const engine = read("supabase/functions/vault-ask/index.ts");
    const route = read("app/api/coach/actions/route.ts");
    expect(engine).toContain('from("coach_action_previews").insert');
    expect(route).toContain('progressAction ? "execute_coach_progress_action" : "execute_coach_action"');
    expect(route).not.toContain('.from("tasks").update');
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("EXCEPTION WHEN OTHERS");
    expect(migration).toContain("v_receipt.payload_hash <> v_payload_hash");
    expect(migration).toContain("interval '2 minutes'");
  });

  it("keeps private feedback out of shared distillation", () => {
    const migration = read("db/migrations/137_coach_action_integrity.sql");
    const cron = read("app/api/cron/brain-distill/route.ts");
    expect(migration).toContain("coalesce(bs.visibility, 'team_learning') = 'team_learning'");
    expect(cron).toContain('.eq("visibility", "team_learning")');
  });

  it("makes direct Coach writes read-only and retention independently scheduled", () => {
    const migration = read("db/migrations/137_coach_action_integrity.sql");
    const vercel = read("vercel.json");
    const retention = read("app/api/cron/coach-retention/route.ts");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON coach_turns");
    expect(migration).toContain("CREATE POLICY coach_turns_owner_select");
    expect(vercel).toContain('"path": "/api/cron/coach-retention"');
    expect(retention).toContain('rpc("purge_expired_coach_private_data")');
  });

  it("loads the newest 100 turns while preserving chronological display", () => {
    const threads = read("app/api/coach/threads/route.ts");
    expect(threads).toContain('.order("created_at", { ascending: false }).limit(100)');
    expect(threads).toContain("[...(turns ?? [])].reverse()");
    expect(threads).toContain('error?.code === "23505"');
  });
});
