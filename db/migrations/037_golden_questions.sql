-- ============================================================
-- 037_golden_questions.sql – Saved spot-checks for each client's Brain
-- Run in Supabase SQL Editor after 036_vault_analyses.sql
--
-- Admins save the questions that MUST answer well ("What's the shipping
-- policy?"), re-ask them after every crawl/refresh, and record pass/fail.
-- Turns Brain quality from a vibe into a measurable regression check.
-- history holds the last results as [{"s":"pass","at":"…"}] (capped in app).
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS golden_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  last_status     TEXT CHECK (last_status IN ('pass','fail')),
  last_checked_at TIMESTAMPTZ,
  history         JSONB NOT NULL DEFAULT '[]',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS golden_questions_client_idx ON golden_questions (client_id, created_at);

ALTER TABLE golden_questions ENABLE ROW LEVEL SECURITY;

-- Admin tool: client admins see their own client's checks, super admin all.
DROP POLICY IF EXISTS "golden_questions_select" ON golden_questions;
CREATE POLICY "golden_questions_select"
  ON golden_questions FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'client_admin' AND client_id = current_user_client_id())
  );

INSERT INTO schema_migrations (version) VALUES ('037_golden_questions.sql')
ON CONFLICT DO NOTHING;
