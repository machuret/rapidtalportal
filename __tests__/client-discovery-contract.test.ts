/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";
import {
  COACH_PAGE_CONTEXT_KEYS,
  coachPageContextForPath,
  coachPageContextPrompt,
} from "@/supabase/functions/_shared/coach-page-context";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Sprint 6 discovery and contextual Coach contract", () => {
  test("covers every primary client workspace with controlled prompt context", () => {
    const paths = [
      "/dashboard", "/tasks", "/messages", "/notebook", "/team", "/content/quick",
      "/content/competitors", "/lead-generation", "/crm", "/competitors", "/company-dna",
      "/vault", "/content/style", "/ask", "/brain/learning", "/company-report",
      "/daily-log", "/my-job", "/sops", "/tools", "/supervision", "/access", "/profile",
    ];
    for (const route of paths) expect(coachPageContextForPath(route)).not.toBeNull();
    expect(coachPageContextForPath("/content/competitors")?.key).toBe("competitors");
    expect(coachPageContextPrompt("leads", "va")).toMatch(/authenticated speaker is the va/iu);
    expect(COACH_PAGE_CONTEXT_KEYS).not.toContain("anything_from_browser");
  });

  test("loads status-only page state after membership validation", () => {
    const edge = read("supabase/functions/vault-ask/index.ts");
    const state = read("supabase/functions/_shared/coach-page-state.ts");
    expect(edge.indexOf("const membershipDenied")).toBeLessThan(edge.indexOf("const pageStatePromise"));
    expect(edge).toContain("CURRENT WORKSPACE STATE (captured now; status summaries only)");
    expect(state).toContain("No bodies, notes, contact details");
    expect(state).not.toMatch(/select\([^)]*(notes|body|email|phone|last_error)/u);
  });

  test("pilot reporting measures client and VA roles and stays service-only", () => {
    const migration = read("db/migrations/20260803000800_client_discovery_coach.sql");
    expect(migration).toContain("VALUES ('client_admin'::TEXT), ('va'::TEXT)");
    expect(migration).toContain("record_selections");
    expect(migration).toContain("destinations_loaded");
    expect(migration).toContain("REVOKE ALL ON FUNCTION health_client_discovery(TIMESTAMPTZ)");
    expect(migration).toContain("Search text and client content are never stored");
  });
});
