/**
 * Live staging acceptance for the client first-success database boundary.
 *
 * Requires a disposable staging client and real tenant JWTs:
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, ONBOARDING_TEST_CLIENT_ID,
 * ONBOARDING_TEST_ACTOR_ID, ONBOARDING_TEST_TENANT_JWT,
 * ONBOARDING_TEST_OTHER_TENANT_JWT. ONBOARDING_TEST_VA_ID additionally enables
 * the real task-trigger acceptance.
 *
 * The test removes only the `company_confirmed` milestone on the explicitly
 * disposable tenant, proves concurrent recording is exactly once, exercises
 * the progress RPC and verifies browser-role RLS. It always cleans up.
 */
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ONBOARDING_TEST_CLIENT_ID: CLIENT_ID,
  ONBOARDING_TEST_ACTOR_ID: ACTOR_ID,
  ONBOARDING_TEST_TENANT_JWT: TENANT_JWT,
  ONBOARDING_TEST_OTHER_TENANT_JWT: OTHER_TENANT_JWT,
  ONBOARDING_TEST_VA_ID: VA_ID,
} = process.env;

const ready = Boolean(
  URL && ANON_KEY && SERVICE_KEY && CLIENT_ID && ACTOR_ID && TENANT_JWT && OTHER_TENANT_JWT,
);
const live = ready ? describe : describe.skip;
const liveTriggerTest = ready && VA_ID ? test : test.skip;

live("Client first-success live database boundary", () => {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = ready ? createClient(URL!, SERVICE_KEY!, options) : null;
  const tenant = ready ? createClient(URL!, ANON_KEY!, {
    ...options,
    global: { headers: { Authorization: `Bearer ${TENANT_JWT}` } },
  }) : null;
  const otherTenant = ready ? createClient(URL!, ANON_KEY!, {
    ...options,
    global: { headers: { Authorization: `Bearer ${OTHER_TENANT_JWT}` } },
  }) : null;

  test("records one durable milestone under concurrency and isolates it by tenant", async () => {
    const milestone = "company_confirmed";
    const cleanup = async () => {
      await admin!.from("client_onboarding_events")
        .delete().eq("client_id", CLIENT_ID!).eq("step", "company");
      await admin!.from("client_onboarding_milestones")
        .delete().eq("client_id", CLIENT_ID!).eq("milestone", milestone);
    };

    await cleanup();
    try {
      const args = {
        p_client_id: CLIENT_ID!,
        p_milestone: milestone,
        p_completed_by: ACTOR_ID!,
        p_source_type: "company_dna",
        p_source_id: null,
        p_metadata: { acceptance: true },
      };
      const attempts = await Promise.all([
        admin!.rpc("record_client_onboarding_milestone", args),
        admin!.rpc("record_client_onboarding_milestone", args),
      ]);
      expect(attempts.every((attempt) => attempt.error === null)).toBe(true);
      expect(attempts.map((attempt) => attempt.data).sort()).toEqual([false, true]);

      const progress = await admin!.rpc("get_client_first_success_progress", {
        p_client_id: CLIENT_ID!,
      });
      expect(progress.error).toBeNull();
      expect(progress.data).toEqual(expect.objectContaining({
        milestones: expect.arrayContaining([milestone]),
      }));

      const events = await admin!.from("client_onboarding_events")
        .select("id").eq("client_id", CLIENT_ID!).eq("step", "company")
        .eq("event_type", "step_completed");
      expect(events.error).toBeNull();
      expect(events.data).toHaveLength(1);

      const ownRead = await tenant!.from("client_onboarding_milestones")
        .select("milestone").eq("client_id", CLIENT_ID!).eq("milestone", milestone);
      expect(ownRead.error).toBeNull();
      expect(ownRead.data).toHaveLength(1);

      const browserWrite = await tenant!.from("client_onboarding_milestones").insert({
        client_id: CLIENT_ID!,
        milestone: "voice_configured",
        completed_by: ACTOR_ID!,
        source_type: "company_dna",
      });
      expect(browserWrite.error).not.toBeNull();

      const crossTenantRead = await otherTenant!.from("client_onboarding_milestones")
        .select("milestone").eq("client_id", CLIENT_ID!);
      expect(crossTenantRead.error).toBeNull();
      expect(crossTenantRead.data).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  liveTriggerTest("records the VA-request milestone from a real task and does not regress when it is removed", async () => {
    const milestone = "va_task_requested";
    const cleanupMilestone = async () => {
      await admin!.from("client_onboarding_events")
        .delete().eq("client_id", CLIENT_ID!).eq("step", "task");
      await admin!.from("client_onboarding_milestones")
        .delete().eq("client_id", CLIENT_ID!).eq("milestone", milestone);
    };
    await cleanupMilestone();
    let taskId: string | null = null;
    try {
      const created = await admin!.from("tasks").insert({
        client_id: CLIENT_ID!,
        assigned_to: VA_ID!,
        created_by: ACTOR_ID!,
        title: `Onboarding acceptance ${Date.now()}`,
        description: "Disposable trigger acceptance",
        status: "todo",
      }).select("id").single();
      expect(created.error).toBeNull();
      taskId = created.data!.id;

      const recorded = await admin!.from("client_onboarding_milestones")
        .select("source_id").eq("client_id", CLIENT_ID!).eq("milestone", milestone).single();
      expect(recorded.error).toBeNull();
      expect(recorded.data?.source_id).toBe(taskId);

      await admin!.from("tasks").delete().eq("id", taskId);
      taskId = null;
      const durable = await admin!.from("client_onboarding_milestones")
        .select("milestone").eq("client_id", CLIENT_ID!).eq("milestone", milestone);
      expect(durable.data).toHaveLength(1);
    } finally {
      if (taskId) await admin!.from("tasks").delete().eq("id", taskId);
      await cleanupMilestone();
    }
  });
});
