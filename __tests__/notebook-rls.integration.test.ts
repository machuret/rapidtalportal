/**
 * Acceptance: an admin JWT must NOT be able to read notebook page content or
 * titles — the exclusion is enforced by Postgres RLS, not the frontend.
 *
 * This is a live-instance integration test. It runs only when the following
 * env vars are set (so CI without a DB skips it cleanly):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   NOTEBOOK_TEST_ADMIN_JWT   – access token for a super_admin user
 *   NOTEBOOK_TEST_PLACEMENT_ID – a placement that has seeded pages
 *
 * Run against staging:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   NOTEBOOK_TEST_ADMIN_JWT=… NOTEBOOK_TEST_PLACEMENT_ID=… \
 *   npx jest notebook-rls
 */
import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  NOTEBOOK_TEST_ADMIN_JWT: ADMIN_JWT,
  NOTEBOOK_TEST_PLACEMENT_ID: PLACEMENT,
} = process.env;

const ready = !!(URL && ANON && ADMIN_JWT && PLACEMENT);
const d = ready ? describe : describe.skip;

d("Notebook RLS — admin content exclusion", () => {
  // Created lazily: a skipped describe still executes its body, so we must not
  // build the client (which validates the URL) when env vars are absent.
  const admin = ready
    ? createClient(URL!, ANON!, {
        global: { headers: { Authorization: `Bearer ${ADMIN_JWT}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : (null as unknown as ReturnType<typeof createClient>);

  it("admin JWT selects ZERO notebook_pages rows", async () => {
    const { data, error } = await admin.from("notebook_pages").select("id, title, content").eq("placement_id", PLACEMENT!);
    expect(error).toBeNull(); // RLS returns an empty set, not an error
    expect(data ?? []).toHaveLength(0);
  });

  it("admin JWT selects ZERO notebook_page_revisions rows", async () => {
    const { data } = await admin.from("notebook_page_revisions").select("id, title, content").limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it("admin JWT CAN read notebook_activity (metadata only)", async () => {
    const { error } = await admin.from("notebook_activity").select("event, actor_role, created_at").eq("placement_id", PLACEMENT!).limit(1);
    expect(error).toBeNull();
  });
});
