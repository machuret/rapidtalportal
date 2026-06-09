-- ============================================================
-- 025_vault_feedback.sql – Thumbs up/down on Ask the Vault answers (quality loop)
-- Run in Supabase SQL Editor after 024_vault_queries.sql
--
-- Feeds the quality side of the flywheel: 👎 answers get flagged for review,
-- 👍 answers can be promoted into the curated Knowledge Base. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS vault_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  rating     SMALLINT NOT NULL CHECK (rating IN (1, -1)),  -- 1 = up, -1 = down
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_feedback_client_idx ON vault_feedback (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vault_feedback_rating_idx ON vault_feedback (client_id, rating);

ALTER TABLE vault_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vault_feedback_own_client_select" ON vault_feedback;
CREATE POLICY "vault_feedback_own_client_select"
  ON vault_feedback FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');
