-- ============================================================
-- 071_brain_memory.sql – Distilled Brain Memory (Phase 3: learning from mistakes)
-- Run in Supabase SQL Editor after 070_content_topics_brain.sql
--
-- The Brain periodically reads accumulated feedback (brain_signals) and distils
-- it into durable, human-readable lessons stored here — preferences to favour,
-- anti-patterns to avoid, and hard rules. These get injected into every
-- generation (lib/brain/context.ts), which is how the Brain "learns from its
-- mistakes" without retraining. Admins can read, pin, deactivate or delete each
-- lesson, so the learning is fully transparent and correctable.
--
-- brain_signals.distilled_at marks signals already folded into memory so a
-- distillation run never reprocesses them. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_memory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('preference', 'anti_pattern', 'rule')),
  content      TEXT NOT NULL,
  confidence   SMALLINT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  source_count INTEGER NOT NULL DEFAULT 1,
  active       BOOLEAN NOT NULL DEFAULT true,
  pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_memory_client_idx ON brain_memory (client_id, active, pinned DESC, created_at DESC);

ALTER TABLE brain_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_memory_own_client_select" ON brain_memory;
CREATE POLICY "brain_memory_own_client_select"
  ON brain_memory FOR SELECT
  USING (client_id = current_user_client_id() OR current_user_role() = 'super_admin');

ALTER TABLE brain_signals
  ADD COLUMN IF NOT EXISTS distilled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS brain_signals_undistilled_idx
  ON brain_signals (client_id, created_at) WHERE distilled_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('071_brain_memory.sql')
ON CONFLICT DO NOTHING;
