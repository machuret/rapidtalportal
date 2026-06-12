#!/usr/bin/env node
/**
 * Migration runner — ends the copy-paste-into-SQL-editor era.
 *
 * The 018-023 incident: four migrations were never applied to production, so
 * search silently answered from scraps for weeks. Root cause wasn't a bug —
 * it was hand-applied SQL with no record of what actually ran. This script
 * makes db/migrations/ the single source of truth.
 *
 * Usage (SUPABASE_DB_URL = the Postgres connection string from
 * Supabase → Project Settings → Database → Connection string / URI):
 *
 *   SUPABASE_DB_URL=postgres://... node scripts/apply-migrations.mjs --status
 *   SUPABASE_DB_URL=postgres://... node scripts/apply-migrations.mjs --baseline
 *   SUPABASE_DB_URL=postgres://... node scripts/apply-migrations.mjs --apply
 *
 *   --status    list applied vs pending migrations (read-only)
 *   --baseline  mark ALL repo migrations as applied WITHOUT running them.
 *               One-time use on an existing database whose schema was built
 *               by hand — after this, only NEW files are ever applied.
 *   --apply     run pending migrations in filename order, each in its own
 *               transaction; record each in schema_migrations. Stops at the
 *               first failure (later files often depend on earlier ones).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

const mode = process.argv.find((a) => ["--status", "--baseline", "--apply"].includes(a));
if (!mode) {
  console.error("Usage: apply-migrations.mjs --status | --baseline | --apply");
  process.exit(2);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (Supabase → Project Settings → Database → Connection string).");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, application_name: "apply-migrations" });

async function main() {
  await client.connect();

  // The ledger of what has run. IF NOT EXISTS so the runner works on a fresh DB.
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ DEFAULT now()
     )`,
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f));

  if (mode === "--status") {
    for (const f of files) console.log(`${applied.has(f) ? "✓ applied" : "• PENDING"}  ${f}`);
    const ghost = [...applied].filter((v) => !files.includes(v)).sort();
    if (ghost.length) console.log(`\n⚠ recorded in DB but missing from repo: ${ghost.join(", ")}`);
    console.log(`\n${files.length} in repo · ${files.length - pending.length} applied · ${pending.length} pending`);
    return;
  }

  if (mode === "--baseline") {
    if (!pending.length) { console.log("Nothing to baseline — ledger already matches the repo."); return; }
    for (const f of pending) {
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
      console.log(`baselined (not run): ${f}`);
    }
    console.log(`\nBaselined ${pending.length} file(s). From now on, only new migrations will be applied.`);
    return;
  }

  // --apply
  if (!pending.length) { console.log("Up to date — nothing pending."); return; }
  for (const f of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, f), "utf8");
    process.stdout.write(`applying ${f} … `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      // The file usually self-records; this makes it true even when it doesn't.
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
      await client.query("COMMIT");
      console.log("ok");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      console.error(`\n${f}: ${err.message}\nStopped — fix this migration, then re-run --apply.`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`\nApplied ${pending.length} migration(s).`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => client.end());
