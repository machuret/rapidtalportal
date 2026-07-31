/** @jest-environment node */

import { readFileSync } from "fs";
import path from "path";
import { resolveCompetitorTargets } from "@/supabase/functions/_shared/competitor-context";

const competitors = [
  { id: "one", name: "Northstar Staffing" },
  { id: "two", name: "Build Crew" },
  { id: "three", name: "X" },
];

describe("Vault competitor context boundary", () => {
  test("generic competitor questions select the configured market set", () => {
    const result = resolveCompetitorTargets("What are our competitors publishing?", competitors);
    expect(result.explicitIntent).toBe(true);
    expect(result.targets.map((item) => item.id)).toEqual(["one", "two", "three"]);
  });

  test("a saved competitor name opts in only that competitor", () => {
    const result = resolveCompetitorTargets("What has Build Crew said about apprentices?", competitors);
    expect(result.explicitIntent).toBe(false);
    expect(result.targets.map((item) => item.id)).toEqual(["two"]);
  });

  test("ordinary company questions cannot pull competitor material", () => {
    expect(resolveCompetitorTargets("What services do we offer?", competitors).targets).toEqual([]);
    // Very short competitor names are not treated as safe free-text triggers.
    expect(resolveCompetitorTargets("What does x mean?", competitors).targets).toEqual([]);
  });

  test("Client Vault exposes competitors while Ask uses snapshot-backed market intelligence", () => {
    const root = path.resolve(__dirname, "..");
    const vault = readFileSync(path.join(root, "components/vault/VaultClient.tsx"), "utf8");
    const ask = readFileSync(path.join(root, "supabase/functions/vault-ask/index.ts"), "utf8");
    expect(vault).toContain('<CompetitorsTab');
    expect(vault).toContain('role === "client_admin" || role === "super_admin"');
    expect(ask).not.toContain('.from("competitor_content_items")');
    expect(ask).toContain("includeMarketIntelligence:");
    expect(ask).toContain('kind: "market"');
    expect(ask).toContain("not a company fact or owned style");
  });
});
