/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("client experience final hardening", () => {
  test("all Supabase client factories use the shared bounded transport", () => {
    for (const file of [
      "lib/supabase/admin.ts",
      "lib/supabase/server.ts",
      "lib/supabase/client.ts",
      "lib/api-auth.ts",
    ]) {
      expect(read(file)).toContain("boundedSupabaseFetch");
    }
  });

  test("the scheduled role journey includes onboarding and discovery", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["test:e2e:roles"]).toContain("client-first-success.spec.ts");
    expect(pkg.scripts["test:e2e:roles"]).toContain("client-discovery-coach.spec.ts");
  });

  test("competitor promotion is acknowledged only after project creation succeeds", () => {
    const source = read("components/content/competitors/CompetitorsTab.tsx");
    expect(source).toContain("const promoted = await onIdeaSelected?.(idea, run) ?? false");
    expect(source).toContain("if (promoted) setIdeaPromoted(true)");
  });

  test("the assignment request is service-only and idempotent per client", () => {
    const migration = read("db/migrations/20260803000900_client_va_assignment_requests.sql");
    expect(migration).toContain("WHERE status = 'pending'");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION request_client_va_assignment[\s\S]*FROM PUBLIC, anon, authenticated/u);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION request_client_va_assignment[\s\S]*TO service_role/u);
  });
});
