-- ============================================================
-- 069_brain_signals.sql – Unified feedback signals (the Brain's learning input)
-- Run in Supabase SQL Editor after 068_company_brain_fields.sql
--
-- Every judgement a human makes on AI output — 👍 / 👎 / "this makes no sense"
-- with an optional reason — lands here, across surfaces (content topics today;
-- Ask the Vault, Compose, Tools next). The Brain reads these as few-shot
-- positives/negatives (Phase 2) and later distils them into curated memory
-- (Phase 3). Generalises the older vault_feedback table, which keeps working.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  surface       TEXT NOT NULL,                 -- 'content_topic' | 'vault_answer' | 'compose' | 'tool' | ...
  artifact_id   UUID,                          -- optional: the row this judges (e.g. content_topics.id)
  artifact_text TEXT NOT NULL,                 -- the judged content, captured verbatim for learning
  rating        SMALLINT NOT NULL CHECK (rating IN (1, -1)),  -- 1 = 👍, -1 = 👎 / flag
  reason        TEXT,                          -- "doesn't make sense", free text
  context       JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_signals_client_idx  ON brain_signals (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_signals_rating_idx  ON brain_signals (client_id, rating);
CREATE INDEX IF NOT EXISTS brain_signals_surface_idx ON brain_signals (client_id, surface, created_at DESC);

ALTER TABLE brain_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_signals_own_client_select" ON brain_signals;
CREATE POLICY "brain_signals_own_client_select"
  ON brain_signals FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

INSERT INTO schema_migrations (version) VALUES ('069_brain_signals.sql')
ON CONFLICT DO NOTHING;
