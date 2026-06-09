-- ============================================================
-- 024_vault_queries.sql – Log every "Ask the Vault" question (learning flywheel)
-- Run in Supabase SQL Editor after 023_knowledge_fts.sql
--
-- Every question + whether it was answered is recorded. This is the raw signal
-- for gap detection ("what does the team ask that the brain can't answer?") and
-- usage analytics. Written best-effort by vault-ask (service role). Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS vault_queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  question      TEXT NOT NULL,
  mode          TEXT NOT NULL DEFAULT 'concise',
  sources_count INT  NOT NULL DEFAULT 0,
  answered      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_queries_client_idx     ON vault_queries (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vault_queries_answered_idx   ON vault_queries (client_id, answered);

ALTER TABLE vault_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vault_queries_own_client_select" ON vault_queries;
CREATE POLICY "vault_queries_own_client_select"
  ON vault_queries FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');
