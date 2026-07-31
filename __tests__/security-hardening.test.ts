/** @jest-environment node */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("service-only database functions", () => {
  const migration = read("db/migrations/084_function_privilege_hardening.sql");
  const functions = [
    "admin_client_overview()",
    "health_vault_tallies()",
    "health_schema_check()",
    "get_contact_status_counts(UUID)",
  ];

  test.each(functions)("%s is invoker-only and not executable by API roles", (signature) => {
    const qualified = `public.${signature}`;
    expect(migration).toContain(`ALTER FUNCTION ${qualified} SECURITY INVOKER`);
    expect(migration).toContain(
      `REVOKE ALL ON FUNCTION ${qualified} FROM PUBLIC, anon, authenticated`,
    );
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${qualified} TO service_role`);
  });
});

describe("crawl worker leases", () => {
  const migration = read("db/migrations/085_crawl_job_leases.sql");
  const route = read("app/api/vault/crawl-site/advance/route.ts");

  test("claiming is an atomic database operation with an expiring token", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION claim_crawl_job");
    expect(migration).toContain("lease_token = gen_random_uuid()");
    expect(migration).toContain("lease_until <= clock_timestamp()");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION claim_crawl_job(UUID, INT) FROM PUBLIC, anon, authenticated;",
    );
  });

  test("workers claim through the RPC and checkpoint only with their token", () => {
    expect(route).toContain('admin.rpc("claim_crawl_job"');
    expect(route).toContain('.eq("lease_token", leaseToken)');
    expect(route).toContain("lease_token: null, lease_until: null");
    expect(route).not.toContain('.eq("updated_at", job.updated_at)');
  });
});

describe("atomic Brain distillation", () => {
  const migration = read("db/migrations/086_atomic_brain_distillation.sql");
  const distill = read("lib/brain/distill.ts");
  const signalRoute = read("app/api/brain/signals/route.ts");

  test("workers claim feedback with row locking and an expiring token", () => {
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("distill_claim_token = v_token");
    expect(migration).toContain("distill_claim_until <= clock_timestamp()");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION claim_brain_signals(UUID, INT, INT, INT) FROM PUBLIC, anon, authenticated;",
    );
  });

  test("memory writes and acknowledgement share one database transaction", () => {
    const commitStart = migration.indexOf("CREATE OR REPLACE FUNCTION commit_brain_distillation");
    const memoryInsert = migration.indexOf("INSERT INTO brain_memory", commitStart);
    const acknowledgement = migration.indexOf("UPDATE brain_signals", memoryInsert);
    expect(commitStart).toBeGreaterThan(-1);
    expect(memoryInsert).toBeGreaterThan(commitStart);
    expect(acknowledgement).toBeGreaterThan(memoryInsert);
    expect(migration).toContain("IF v_marked <> v_expected THEN");
    expect(distill).toContain('admin.rpc("commit_brain_distillation"');
    expect(distill).not.toContain("const markDistilled");
  });

  test("re-rating feedback invalidates an in-flight claim", () => {
    expect(signalRoute).toContain("distill_claim_token: null");
    expect(signalRoute).toContain("distill_claim_until: null");
  });
});

describe("Brain surface scoping", () => {
  const distill = read("lib/brain/distill.ts");
  const ask = read("supabase/functions/vault-ask/index.ts");
  const content = read("supabase/functions/content-generate/index.ts");

  test("distillation emits the Phase 2 canonical scope vocabulary", () => {
    expect(distill).toContain('surfaces ["ask","content","compose","tool"]');
    expect(distill).toContain("normalizeBrainMemoryScope");
    expect(distill).not.toContain('"vault_answer"');
  });

  test("the legacy context builder is removed and both Edge surfaces use the official resolver", () => {
    expect(existsSync(path.join(root, "lib/brain/context.ts"))).toBe(false);
    expect(ask).toContain("resolveBrainContext({");
    expect(content).toContain("resolveBrainContext({");
    expect(ask).not.toContain("memoryAppliesToSurfaces");
    expect(content).not.toContain("memoryAppliesToSurfaces");
  });
});

describe("content approval and style integrity", () => {
  const migration = read("db/migrations/088_content_approval_integrity.sql");
  const guardMigration = read("db/migrations/089_content_approval_guard.sql");
  const guardExecutionMigration = read("db/migrations/090_content_guard_execution.sql");
  const hardRulesMigration = read("db/migrations/094_structured_content_hard_rules.sql");
  const piecesRoute = read("app/api/content/pieces/route.ts");
  const generator = read("supabase/functions/content-generate/index.ts");
  const orchestration = read("supabase/functions/_shared/content-generation-orchestration.ts");

  test("approval locks the piece and exact Company DNA version in one RPC", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("FOR SHARE");
    expect(migration).toContain("v_piece.updated_at IS DISTINCT FROM p_expected_piece_updated_at");
    expect(migration).toContain("v_dna_updated_at IS DISTINCT FROM p_expected_dna_updated_at");
    expect(migration).toContain("Only draft content can be edited.");
    expect(piecesRoute).toContain('rpc("update_content_piece_atomic"');
  });

  test("the approval RPC is service-only and requires a style snapshot", () => {
    expect(migration).toContain("p_style_snapshot IS NULL");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(piecesRoute).toContain("contentQualityWarnings({");
    expect(piecesRoute).toContain("createContentStyleSnapshot(style, current.content_type");
  });

  test("the database blocks approved edits and validates legacy approval paths", () => {
    expect(guardMigration).toContain("BEFORE UPDATE ON content_pieces");
    expect(guardMigration).toContain("Only draft content can be edited.");
    expect(guardMigration).toContain("content_contains_phrase(NEW.body, v_phrase)");
    expect(guardMigration).toContain("emoji are not allowed");
    expect(guardMigration).toContain("NEW.style_snapshot := jsonb_build_object");
    expect(guardExecutionMigration).toContain("enforce_content_piece_approval() SECURITY DEFINER");
    expect(guardExecutionMigration).toContain("FROM PUBLIC, anon, authenticated");
  });

  test("structured hard rules are stored and enforced again at the database boundary", () => {
    expect(hardRulesMigration).toContain("ADD COLUMN IF NOT EXISTS hard_rules JSONB");
    expect(hardRulesMigration).toContain("jsonb_array_elements");
    expect(hardRulesMigration).toContain("v_rule_type = 'require_phrase'");
    expect(hardRulesMigration).toContain("v_rule_type = 'max_words'");
    expect(hardRulesMigration).toContain("v_rule_type = 'max_emojis'");
    expect(hardRulesMigration).toContain("REVOKE ALL ON FUNCTION enforce_content_piece_approval()");
  });

  test("generation requires official Brain context and its immutable snapshot", () => {
    expect(generator).toContain("if (dnaError)");
    expect(generator).toContain("if (!dna)");
    expect(generator).toContain("resolveBrainContext({");
    expect(generator).toContain("persistBrainContextSnapshot({");
    expect(generator).not.toContain("retrieveContentVault");
    expect(generator).toContain("could not prepare and snapshot verified context");
    expect(generator).toContain("recoverable: true");
    expect(orchestration).toContain("=== PLATFORM OUTPUT CONTRACT ===");
    expect(orchestration).toContain("=== STRUCTURED BRIEF ===");
  });

  test("X is supported and combined multi-platform generation is rejected", () => {
    const quality = read("supabase/functions/_shared/content-quality.ts");
    expect(migration).toContain("'email', 'x', 'linkedin'");
    expect(quality).toContain('x: "Write one X / Twitter post within 280 characters.');
    expect(generator).not.toContain("social: `Write three clearly labelled variants");
    expect(generator).not.toContain('"instagram", "social", "newsletter"');
  });
});

describe("content learning policy", () => {
  const migration = read("db/migrations/091_disable_content_performance_learning.sql");
  const piecesRoute = read("app/api/content/pieces/route.ts");

  test("performance signals are blocked while manual content feedback remains available", () => {
    expect(migration).toContain("NEW.surface = 'content_outcome'");
    expect(migration).toContain("NEW.context->>'event'");
    expect(migration).toContain("Content performance signals are not part of the Brain learning model.");
    expect(piecesRoute).not.toContain("recordApprovalOutcome");
  });
});

describe("seed safety", () => {
  const seed = read("db/seed.mjs");

  test("there is one seed implementation and it has no known passwords", () => {
    expect(existsSync(path.join(root, "db/seed.ts"))).toBe(false);
    expect(seed).not.toMatch(/Admin1234!|Client1234!|Va1234!|password:\s*["']admin["']/);
  });

  test("remote seeding requires an explicit, exact project allow-list", () => {
    expect(seed).toContain('process.env.SEED_ALLOW_REMOTE !== "true"');
    expect(seed).toContain("SEED_EXPECTED_PROJECT_REF");
    expect(seed).toContain("projectRef !== expected");
  });
});

describe("service-role API tenant guards", () => {
  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const absolute = path.join(dir, name);
      return statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
    });
  }

  test("every service-role route accepting tenant identifiers declares an authorization boundary", () => {
    const apiRoot = path.join(root, "app/api");
    const routes = filesUnder(apiRoot)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("createAdminClient")
          && /\bclientId\b|\bclient_id\b/.test(source);
      });

    const recognizedGuard =
      /assertClientAccess|requireSuperAdmin|withSuperAdmin|CRON_SECRET|user\.client_id|roles:\s*\[[^\]]*super_admin|authorizeScope|actualUser|proxyToEdgeFunction/;
    const unguarded = routes
      .filter((file) => !recognizedGuard.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));

    expect(unguarded).toEqual([]);
  });
});

describe("admin company profile and LinkedIn style sources", () => {
  const migration = read("db/migrations/098_admin_company_profile_sources.sql");
  const clientRoute = read("app/api/admin/clients/[id]/route.ts");
  const linkedInRoute = read("app/api/vault/linkedin/route.ts");
  const retrieval = read("supabase/functions/_shared/content-vault-retrieval.ts");
  const ask = read("supabase/functions/vault-ask/index.ts");

  test("admin company identity is stored in Company DNA and one curated Vault source", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS company_description TEXT");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS social_links JSONB");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION sync_admin_company_profile");
    expect(migration).toContain("ON CONFLICT (client_id, origin_key) DO UPDATE");
    expect(migration).toContain("DELETE FROM vault_chunks WHERE item_id = v_item_id");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(clientRoute).toContain('db.rpc("sync_admin_company_profile"');
    expect(clientRoute).toContain("scheduleVaultProcess(profileVaultItemId");
  });

  test("LinkedIn collection is tenant-guarded and stores only style-example records", () => {
    expect(linkedInRoute).toContain("assertClientAccess(user, parsed.data.clientId)");
    expect(linkedInRoute).toContain('host !== "linkedin.com"');
    expect(linkedInRoute).toContain('path.startsWith(`/posts/${companySlug}_`)');
    expect(linkedInRoute).toContain("ignoreInvalidURLs: false");
    expect(linkedInRoute).toContain('evidence_role: "style_example"');
    expect(linkedInRoute).toContain('tags: ["linkedin", "style_example", "company_owned", "social_post"]');
    expect(linkedInRoute).toContain('onConflict: "client_id,origin_key"');
  });

  test("style examples influence channel style but cannot become factual evidence", () => {
    const brainResolver = read("supabase/functions/_shared/brain-context.ts");
    expect(migration).toContain("AND vi.evidence_role = 'factual'");
    expect(retrieval).toContain('.eq("evidence_role", "factual")');
    expect(retrieval).toContain('.eq("evidence_role", "style_example")');
    expect(retrieval).toContain("Never treat them as factual evidence");
    expect(ask).toContain("resolveBrainContext({");
    expect(brainResolver).toContain('.eq("evidence_role", "factual")');
  });
});
