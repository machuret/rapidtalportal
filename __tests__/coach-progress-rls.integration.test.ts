/**
 * Live acceptance coverage for the Phase 3 database boundary. CI/staging can
 * enable it with two real users from different companies and one private goal:
 *
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * COACH_TEST_OWNER_JWT, COACH_TEST_OTHER_COMPANY_JWT, COACH_TEST_GOAL_ID
 */
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  COACH_TEST_OWNER_JWT: OWNER_JWT,
  COACH_TEST_OTHER_COMPANY_JWT: OTHER_JWT,
  COACH_TEST_GOAL_ID: GOAL_ID,
} = process.env;
const ready = Boolean(URL && ANON && OWNER_JWT && OTHER_JWT && GOAL_ID);
const live = ready ? describe : describe.skip;

function client(jwt: string) {
  return createClient(URL!, ANON!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

live("Coach progress live RLS", () => {
  const owner = ready ? client(OWNER_JWT!) : null;
  const outsider = ready ? client(OTHER_JWT!) : null;

  it("lets only the owner read the private goal", async () => {
    const owned = await owner!.from("coach_goals").select("id,title,status").eq("id", GOAL_ID!).maybeSingle();
    expect(owned.error).toBeNull();
    expect(owned.data?.id).toBe(GOAL_ID);

    const hidden = await outsider!.from("coach_goals").select("id,title,status").eq("id", GOAL_ID!);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
  });

  it("rejects direct browser mutation even for the owner", async () => {
    const result = await owner!.from("coach_goals").update({ progress: 99 }).eq("id", GOAL_ID!).select("id");
    expect(result.error).not.toBeNull();
  });

  it("does not expose the owner's progress events to another company", async () => {
    const hidden = await outsider!.from("coach_progress_events").select("id,goal_id,event_type").eq("goal_id", GOAL_ID!);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
  });
});
