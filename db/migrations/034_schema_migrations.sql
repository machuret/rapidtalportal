-- ============================================================
-- 034_schema_migrations.sql – Track which migrations have been applied
-- Run in Supabase SQL Editor after 033_access_credentials.sql
--
-- Until now, migrations were pasted into the SQL editor by hand with nothing
-- recording what had actually run — so there was no way to know whether the
-- live database matched the files in db/migrations/. This adds a registry.
--
-- Convention going forward: the LAST line of every new migration file inserts
-- its own filename here, e.g.
--   INSERT INTO schema_migrations (version) VALUES ('035_whatever.sql')
--   ON CONFLICT DO NOTHING;
-- so applying a migration self-records, and you can diff this table against the
-- folder to see what's outstanding:
--   SELECT version FROM schema_migrations ORDER BY version;
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lock it down — this is operational metadata, not app data. No policy grants
-- access, so with RLS on, the anon/auth roles can't read or write it; only the
-- service role (which bypasses RLS) and SQL-editor sessions touch it.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Backfill everything that exists as of this migration. If your database was
-- built from these files in order, all of these are already applied; this
-- simply records that fact. ON CONFLICT keeps it safe to re-run.
INSERT INTO schema_migrations (version) VALUES
  ('001_initial.sql'),
  ('002_crm.sql'),
  ('003_sops_content.sql'),
  ('004_daily_log.sql'),
  ('005_perf.sql'),
  ('006_user_profile.sql'),
  ('007_time_entries.sql'),
  ('008_kb_categories.sql'),
  ('009_manual_time_entries.sql'),
  ('010_messages.sql'),
  ('011_vault_enhancements.sql'),
  ('012_team_fields_va_vault.sql'),
  ('013_fix_rls_recursion.sql'),
  ('014_content_topics.sql'),
  ('015_vault_content_hash.sql'),
  ('016_missing_indexes.sql'),
  ('017_kb_pinned.sql'),
  ('018_vault_embeddings.sql'),
  ('019_impersonation_log.sql'),
  ('020_vault_search.sql'),
  ('021_handle_new_auth_user.sql'),
  ('022_embeddings_gte_small.sql'),
  ('023_knowledge_fts.sql'),
  ('024_vault_queries.sql'),
  ('025_vault_feedback.sql'),
  ('026_vault_meta_curated.sql'),
  ('027_learning_loops.sql'),
  ('028_global_sops.sql'),
  ('029_seed_global_sops.sql'),
  ('030_sop_runs.sql'),
  ('031_tasks.sql'),
  ('032_tasks_realtime.sql'),
  ('033_access_credentials.sql'),
  ('034_schema_migrations.sql')
ON CONFLICT DO NOTHING;
