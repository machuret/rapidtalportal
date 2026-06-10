-- ============================================================
-- 036_vault_analyses.sql – Deep "Expanded View" strategic analysis
-- Run in Supabase SQL Editor after 035_crawl_jobs.sql
--
-- The Recap/dossier is grounded FACT and feeds Ask the Vault. This is the
-- opposite kind of artifact: an interpretive, frontier-model analysis of
-- industry position, branding, audience, and strategy. It is deliberately
-- kept OUT of the retrieval index (its own table, not vault_items) so that
-- inference never contaminates grounded answers — it's for humans to read.
-- One current analysis per client (regenerate overwrites). Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS vault_analyses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  model       TEXT,
  source_url  TEXT,
  tokens_used INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vault_analyses ENABLE ROW LEVEL SECURITY;

-- Everyone in the client can read it; generation goes through the API
-- (service role), so no insert/update policies are granted.
DROP POLICY IF EXISTS "vault_analyses_select" ON vault_analyses;
CREATE POLICY "vault_analyses_select"
  ON vault_analyses FOR SELECT
  USING (current_user_role() = 'super_admin' OR client_id = current_user_client_id());

INSERT INTO schema_migrations (version) VALUES ('036_vault_analyses.sql')
ON CONFLICT DO NOTHING;
