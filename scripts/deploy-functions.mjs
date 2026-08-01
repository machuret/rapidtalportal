#!/usr/bin/env node
/**
 * Deploy the Supabase Edge Functions.
 *
 * These are NOT deployed by `git push` (only the Next app is) — they must be
 * pushed to Supabase separately. This script deploys every function under
 * supabase/functions/ so none get silently forgotten after a change.
 *
 *   pnpm functions:deploy                 # deploy all functions
 *   pnpm functions:deploy vault-ask       # deploy just one (or a few)
 *   SUPABASE_PROJECT_REF=abc pnpm functions:deploy   # target a specific project
 *
 * Requires the Supabase CLI (https://supabase.com/docs/guides/cli) to be
 * installed and authenticated (`supabase login`), with the project linked
 * (`supabase link`) or SUPABASE_PROJECT_REF set.
 */
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions");

// Each function is a subdirectory; non-directory entries (e.g. deno.json) and
// underscore-prefixed shared-module dirs (e.g. _shared) are not functions.
const allFunctions = readdirSync(FUNCTIONS_DIR)
  .filter((name) => statSync(join(FUNCTIONS_DIR, name)).isDirectory() && !name.startsWith("_"))
  .sort();

const requested = process.argv.slice(2);
const targets = requested.length ? requested : allFunctions;

const unknown = targets.filter((t) => !allFunctions.includes(t));
if (unknown.length) {
  console.error(`Unknown function(s): ${unknown.join(", ")}`);
  console.error(`Available: ${allFunctions.join(", ")}`);
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF;
const refArgs = projectRef ? ["--project-ref", projectRef] : [];

console.log(`Deploying ${targets.length} edge function(s): ${targets.join(", ")}\n`);

const failed = [];
for (const name of targets) {
  console.log(`→ supabase functions deploy ${name}`);
  const res = spawnSync("supabase", ["functions", "deploy", name, ...refArgs], { stdio: "inherit" });
  if (res.error) {
    // The CLI isn't installed / not on PATH — fail fast with guidance.
    console.error(`\nCould not run the Supabase CLI: ${res.error.message}`);
    console.error("Install it: https://supabase.com/docs/guides/cli");
    process.exit(1);
  }
  if (res.status !== 0) failed.push(name);
}

if (failed.length) {
  console.error(`\n✗ Failed to deploy: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\n✓ Deployed ${targets.length} function(s).`);
