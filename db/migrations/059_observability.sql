-- ============================================================
-- 059_observability.sql – platform health: heartbeats, index status, schema self-check
-- Run via scripts/apply-migrations.mjs (or Supabase SQL editor) after 058.
--
-- Three pieces that make silent breakage visible (the 018-023 drift incident
-- showed features can be broken per-environment with no alarm):
--   1. cron_heartbeats — every cron records that (and when) it ran.
--   2. vault_items.indexed_at / index_error — the embedding step's outcome is
--      stored per item instead of swallowed in edge-function logs.
--   3. health_schema_check() — the DB reports whether its own critical objects
--      exist, so /admin/health can detect migration drift directly.
-- Idempotent.
-- ============================================================

-- ── 1. Cron heartbeats ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_heartbeats (
  name    TEXT PRIMARY KEY,
  ran_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail  JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE cron_heartbeats ENABLE ROW LEVEL SECURITY;
-- Written by the service role only; super_admin may read (for /admin/health).
DROP POLICY IF EXISTS "cron_heartbeats_admin_select" ON cron_heartbeats;
CREATE POLICY "cron_heartbeats_admin_select" ON cron_heartbeats FOR SELECT
  USING (current_user_role() = 'super_admin');

-- ── 2. Per-item index outcome ────────────────────────────────────────────────
ALTER TABLE vault_items ADD COLUMN IF NOT EXISTS indexed_at  TIMESTAMPTZ;
ALTER TABLE vault_items ADD COLUMN IF NOT EXISTS index_error TEXT;

-- ── 3. Schema self-check ─────────────────────────────────────────────────────
-- Returns one row per critical schema object with whether it exists. SECURITY
-- DEFINER so it can read catalogs regardless of caller grants; super_admin and
-- the service role are the intended callers.
CREATE OR REPLACE FUNCTION health_schema_check()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_agg(jsonb_build_object('name', name, 'ok', ok) ORDER BY name)
  FROM (
    SELECT 'table: vault_chunks' AS name, to_regclass('public.vault_chunks') IS NOT NULL AS ok
    UNION ALL SELECT 'table: placements', to_regclass('public.placements') IS NOT NULL
    UNION ALL SELECT 'table: notebook_pages', to_regclass('public.notebook_pages') IS NOT NULL
    UNION ALL SELECT 'table: task_recurrences', to_regclass('public.task_recurrences') IS NOT NULL
    UNION ALL SELECT 'table: cron_heartbeats', to_regclass('public.cron_heartbeats') IS NOT NULL
    UNION ALL SELECT 'column: vault_items.fts', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vault_items' AND column_name = 'fts')
    UNION ALL SELECT 'column: vault_items.indexed_at', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vault_items' AND column_name = 'indexed_at')
    UNION ALL SELECT 'column: kb_entries.fts', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kb_entries' AND column_name = 'fts')
    UNION ALL SELECT 'column: sops.fts', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sops' AND column_name = 'fts')
    UNION ALL SELECT 'column: tasks.completed_at', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'completed_at')
    UNION ALL SELECT 'column: tasks.archived_at', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'archived_at')
    UNION ALL SELECT 'column: tasks.category_id', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'category_id')
    UNION ALL SELECT 'function: match_vault_chunks', EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'match_vault_chunks')
    UNION ALL SELECT 'function: notebook_is_participant', EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'notebook_is_participant')
    UNION ALL SELECT 'extension: vector', EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'vector')
    UNION ALL SELECT 'rls: notebook_pages has NO admin policy', NOT EXISTS (
      -- The Notebook security model REQUIRES that no policy grants super_admin
      -- access to page content. This check fails if someone ever adds one.
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'notebook_pages'
        AND (qual ILIKE '%super_admin%' OR with_check ILIKE '%super_admin%'))
  ) checks;
$$;

GRANT EXECUTE ON FUNCTION health_schema_check() TO authenticated, service_role;

INSERT INTO schema_migrations (version) VALUES ('059_observability.sql')
ON CONFLICT DO NOTHING;
