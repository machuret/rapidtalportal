/**
 * Live staging acceptance for Sprint 5. It proves real PostgreSQL aggregation,
 * role segmentation, destination correlation, cohort funnel behaviour and the
 * service-only RPC boundary. The explicitly disposable test tenant is required.
 */
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ONBOARDING_TEST_CLIENT_ID: CLIENT_ID,
  ONBOARDING_TEST_ACTOR_ID: ACTOR_ID,
  ONBOARDING_TEST_TENANT_JWT: TENANT_JWT,
} = process.env;

const ready = Boolean(URL && ANON_KEY && SERVICE_KEY && CLIENT_ID && ACTOR_ID && TENANT_JWT);
const live = ready ? describe : describe.skip;

live("Sprint 5 live database aggregation", () => {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = ready ? createClient(URL!, SERVICE_KEY!, options) : null;
  const tenant = ready ? createClient(URL!, ANON_KEY!, {
    ...options,
    global: { headers: { Authorization: `Bearer ${TENANT_JWT}` } },
  }) : null;

  test("aggregates a correlated client-admin journey and denies browser RPC execution", async () => {
    const interactionId = crypto.randomUUID();
    const openedId = crypto.randomUUID();
    const readyId = crypto.randomUUID();
    const marker = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const inserted = await admin!.from("portal_experience_events").insert([{
        id: openedId,
        client_id: CLIENT_ID!,
        user_id: ACTOR_ID!,
        actor_role: "client_admin",
        event_type: "navigation_destination_opened",
        path: "/guide",
        target_path: "/vault",
        navigation_id: interactionId,
        interaction_id: interactionId,
        metadata: { source: "guide_goal", query_token_count: 0, result_count: 1 },
      }, {
        id: readyId,
        client_id: CLIENT_ID!,
        user_id: ACTOR_ID!,
        actor_role: "client_admin",
        event_type: "page_ready",
        path: "/vault",
        navigation_id: interactionId,
        metadata: { stage: "route_shell" },
      }]);
      expect(inserted.error).toBeNull();

      const onboarding = await admin!.from("client_onboarding_events").insert([{
        client_id: CLIENT_ID!, user_id: ACTOR_ID!, event_type: "journey_viewed",
        metadata: { acceptance: marker }, created_at: now,
      }, {
        client_id: CLIENT_ID!, user_id: ACTOR_ID!, event_type: "step_viewed", step: "company",
        metadata: { acceptance: marker }, created_at: now,
      }]);
      expect(onboarding.error).toBeNull();

      const adoption = await admin!.rpc("health_client_adoption", { p_since: new Date(Date.now() - 60_000).toISOString() });
      expect(adoption.error).toBeNull();
      expect(adoption.data?.find((row: { client_id: string }) => row.client_id === CLIENT_ID)).toEqual(expect.objectContaining({
        active_client_admins: 1,
        destinations_opened: 1,
        destinations_loaded: 1,
      }));

      const funnel = await admin!.rpc("health_client_onboarding_funnel", { p_since: new Date(Date.now() - 60_000).toISOString() });
      expect(funnel.error).toBeNull();
      expect(funnel.data?.find((row: { step: string }) => row.step === "company")).toEqual(expect.objectContaining({
        cohort_clients: expect.anything(),
        viewed_clients: expect.anything(),
      }));

      const forbidden = await tenant!.rpc("health_client_adoption", { p_since: new Date(Date.now() - 60_000).toISOString() });
      expect(forbidden.error).not.toBeNull();
    } finally {
      await admin!.from("portal_experience_events").delete().in("id", [openedId, readyId]);
      await admin!.from("client_onboarding_events").delete().eq("metadata->>acceptance", marker);
    }
  });
});
